import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type NotificationRow = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  group_id: string | null;
  related_id: string | null;
  event_key: string;
  payload: Record<string, unknown>;
  delivery_attempt_count: number;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type TokenRow = { id: string; fcm_token: string };
type DeliveryRow = {
  id: string;
  token_id: string | null;
  attempt_count: number;
  next_attempt_at: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const base64Url = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const encodeJson = (value: unknown) =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const importPrivateKey = async (pem: string) => {
  const normalized = pem.replaceAll("\\n", "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/g, "");
  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

const getFcmAccessToken = async (account: ServiceAccount) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(`FCM OAuth failed (${response.status})`);
  }
  return result.access_token as string;
};

const routeFor = (notification: NotificationRow) => {
  if (notification.type === "settlement_request" && notification.group_id && notification.related_id) {
    return `expenso://settlement/${notification.group_id}/${notification.related_id}`;
  }
  if (notification.group_id) return `expenso://group/${notification.group_id}`;
  return "expenso://notifications";
};

const retryAt = (attempt: number) =>
  new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(attempt, 7)) * 1000).toISOString();

const isInvalidToken = (_status: number, errorText: string) =>
  errorText.includes("UNREGISTERED") || errorText.includes("SENDER_ID_MISMATCH");

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!supabaseUrl || !serviceRoleKey || !serviceAccountJson) {
    return jsonResponse({ error: "Notification service is not configured" }, 503);
  }
  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      throw new Error("Missing Firebase service-account fields");
    }
  } catch {
    return jsonResponse({ error: "Invalid Firebase service-account secret" }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let accessTokenPromise: Promise<string> | null = null;

  const processNotification = async (notificationId: string) => {
    const { data: claimed, error: claimError } = await supabase
      .rpc("claim_notification_delivery", { notification_id_param: notificationId });
    if (claimError) throw new Error(`Claim failed: ${claimError.message}`);
    const notification = (claimed as NotificationRow[] | null)?.[0];
    if (!notification) return { notification_id: notificationId, status: "already_claimed" };

    const scheduleNotificationRetry = async (error: unknown) => {
      const attempt = notification.delivery_attempt_count + 1;
      const { error: updateError } = await supabase
        .from("notifications")
        .update({
          delivery_started_at: null,
          delivery_attempt_count: attempt,
          next_delivery_at: retryAt(attempt),
          last_delivery_error: String(error).slice(0, 500),
        })
        .eq("id", notification.id)
        .is("delivered_at", null);
      if (updateError) throw new Error(`Could not persist retry: ${updateError.message}`);
      return { notification_id: notification.id, status: "retry_scheduled" };
    };

    try {
      const { data: tokenData, error: tokenError } = await supabase
        .from("user_fcm_tokens")
        .select("id,fcm_token")
        .eq("user_id", notification.recipient_id);
      if (tokenError) throw new Error(`Token lookup failed: ${tokenError.message}`);
      const tokenRows = (tokenData ?? []) as TokenRow[];

      if (!tokenRows.length) {
        const { error } = await supabase
          .from("notifications")
          .update({
            delivery_started_at: null,
            delivered_at: new Date().toISOString(),
            last_delivery_error: null,
          })
          .eq("id", notification.id);
        if (error) throw new Error(`Completion update failed: ${error.message}`);
        return { notification_id: notification.id, status: "no_registered_devices" };
      }

      const { error: seedError } = await supabase.from("notification_deliveries").upsert(
        tokenRows.map((token) => ({ notification_id: notification.id, token_id: token.id })),
        { onConflict: "notification_id,token_id", ignoreDuplicates: true },
      );
      if (seedError) throw new Error(`Delivery seed failed: ${seedError.message}`);

      const now = new Date().toISOString();
      const { data: dueData, error: dueError } = await supabase
        .from("notification_deliveries")
        .select("id,token_id,attempt_count,next_attempt_at")
        .eq("notification_id", notification.id)
        .eq("status", "pending")
        .lte("next_attempt_at", now);
      if (dueError) throw new Error(`Delivery lookup failed: ${dueError.message}`);
      const dueDeliveries = (dueData ?? []) as DeliveryRow[];
      const tokenById = new Map(tokenRows.map((token) => [token.id, token]));
      const accessToken = dueDeliveries.length
        ? await (accessTokenPromise ??= getFcmAccessToken(serviceAccount))
        : null;
      const deepLink = routeFor(notification);
      const data = Object.fromEntries(
        Object.entries({
          ...notification.payload,
          notification_id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          group_id: notification.group_id,
          settlement_id: notification.type === "settlement_request" ? notification.related_id : null,
          deep_link: deepLink,
        })
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );

      for (const delivery of dueDeliveries) {
        const token = delivery.token_id ? tokenById.get(delivery.token_id) : null;
        if (!token) {
          const { error } = await supabase.from("notification_deliveries").update({
            status: "invalid",
            last_error: "Push token no longer exists",
          }).eq("id", delivery.id);
          if (error) throw new Error(`Invalid-token update failed: ${error.message}`);
          continue;
        }

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: { token: token.fcm_token, data, android: { priority: "high" } },
            }),
          },
        );
        if (response.ok) {
          const { error } = await supabase.from("notification_deliveries").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempt_count: delivery.attempt_count + 1,
            last_error: null,
          }).eq("id", delivery.id);
          if (error) throw new Error(`Sent-state update failed: ${error.message}`);
          continue;
        }

        const errorText = (await response.text()).slice(0, 500);
        if (isInvalidToken(response.status, errorText)) {
          const { error: invalidError } = await supabase.from("notification_deliveries").update({
            status: "invalid",
            attempt_count: delivery.attempt_count + 1,
            last_error: errorText,
          }).eq("id", delivery.id);
          if (invalidError) throw new Error(`Invalid-state update failed: ${invalidError.message}`);
          const { error: deleteError } = await supabase
            .from("user_fcm_tokens")
            .delete()
            .eq("id", token.id);
          if (deleteError) throw new Error(`Invalid-token cleanup failed: ${deleteError.message}`);
        } else {
          const attempt = delivery.attempt_count + 1;
          const { error } = await supabase.from("notification_deliveries").update({
            attempt_count: attempt,
            next_attempt_at: retryAt(attempt),
            last_error: errorText || `FCM returned ${response.status}`,
          }).eq("id", delivery.id);
          if (error) throw new Error(`Retry-state update failed: ${error.message}`);
        }
      }

      const { data: pendingData, error: pendingError } = await supabase
        .from("notification_deliveries")
        .select("next_attempt_at")
        .eq("notification_id", notification.id)
        .eq("status", "pending")
        .order("next_attempt_at", { ascending: true })
        .limit(1);
      if (pendingError) throw new Error(`Pending-state lookup failed: ${pendingError.message}`);

      if (!pendingData?.length) {
        const { error } = await supabase.from("notifications").update({
          delivery_started_at: null,
          delivered_at: new Date().toISOString(),
          last_delivery_error: null,
        }).eq("id", notification.id);
        if (error) throw new Error(`Completion update failed: ${error.message}`);
        return { notification_id: notification.id, status: "sent_to_all_valid_devices" };
      }

      const attempt = notification.delivery_attempt_count + 1;
      const { error: retryError } = await supabase.from("notifications").update({
        delivery_started_at: null,
        delivery_attempt_count: attempt,
        next_delivery_at: pendingData[0].next_attempt_at,
        last_delivery_error: "One or more device deliveries are pending",
      }).eq("id", notification.id);
      if (retryError) throw new Error(`Retry update failed: ${retryError.message}`);
      return { notification_id: notification.id, status: "retry_scheduled" };
    } catch (error) {
      console.error(error);
      return await scheduleNotificationRetry(error);
    }
  };

  const webhookRecord = payload.record as Record<string, unknown> | undefined;
  const notificationId = payload.notification_id ?? webhookRecord?.id;
  let notificationIds: string[];
  if (payload.drain === true) {
    const { data, error } = await supabase
      .from("notifications")
      .select("id")
      .is("delivered_at", null)
      .lte("next_delivery_at", new Date().toISOString())
      .order("next_delivery_at", { ascending: true })
      .limit(25);
    if (error) return jsonResponse({ error: "Unable to load retry queue" }, 500);
    notificationIds = (data ?? []).map((row: { id: string }) => row.id);
  } else if (typeof notificationId === "string") {
    notificationIds = [notificationId];
  } else {
    return jsonResponse({ error: "notification_id or drain=true is required" }, 400);
  }

  try {
    const results = [];
    for (const id of notificationIds) results.push(await processNotification(id));
    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Delivery state could not be persisted" }, 500);
  }
});
