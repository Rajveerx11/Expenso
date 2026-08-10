# Push notifications and inbox setup

Expenso stores every notification in `public.notifications` first. A database webhook then calls the `send-notification` Edge Function, which claims the outbox row once and sends a data-only Firebase Cloud Messaging (FCM) message to every registered installation. The inbox remains usable when push permission is denied or Firebase is not configured.

## 1. Firebase Android configuration

1. Create a Firebase project and add Android app ID `com.expenso.app`.
2. Download `google-services.json` to `app/google-services.json`. This path is ignored by Git. The Google Services Gradle plugin is applied only when the file exists, so credential-free local and CI builds still work.
3. Enable the Firebase Cloud Messaging API for the Google Cloud project.
4. Create a dedicated Firebase service account with only the permission needed to send FCM messages. Never commit its JSON key.

## 2. Supabase configuration

Apply the database migrations, then set the service-account JSON as an Edge Function secret:

```text
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='<single-line-service-account-json>'
supabase functions deploy send-notification
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to hosted Edge Functions by Supabase. Do not add either value to the Android app.

In **Database > Webhooks**, create an `INSERT` webhook for `public.notifications`:

- URL: `https://<project-ref>.supabase.co/functions/v1/send-notification`
- Method: `POST`
- Header: `Authorization: Bearer <service-role-key>`

The Edge Function checks that exact service-role credential before using elevated database access. Keep the webhook and service-role key administrator-only. The standard Edge Function JWT verification should remain enabled.

In **Integrations > Cron**, add an HTTP job that runs every minute against the same function and header, with body `{"drain":true}`. Store the authorization value in Supabase Vault/the protected Cron HTTP configuration, never in migration SQL. This worker drains rows whose `next_delivery_at` is due, including deliveries released after FCM, network, or Edge Function failures.

## 3. Event and route contract

Database triggers enqueue these event types:

- `expense_added` for other group members
- `member_added` for a newly added member
- `settlement_request` for the receiver
- `settlement_confirmed` or `settlement_rejected` for the payer

The Edge Function emits data-only Android payloads with `notification_id`, `type`, `title`, `message`, and `deep_link`. Supported links are:

- `expenso://group/<group-id>`
- `expenso://settlement/<group-id>/<settlement-id>`
- `expenso://notifications`

The Android client rejects unknown schemes and malformed identifiers. Settlement links open the receiver confirmation screen; other group events open group details.

## 4. Lifecycle and failure behavior

- A random installation ID identifies one app installation without exposing Android hardware identifiers.
- Login and FCM token rotation call `register_push_token`; sign-out completes only after the server registration is removed or Firebase invalidates the local token. If both fail, the authenticated session and local retry metadata are retained.
- The database permits no direct client writes to token or notification tables.
- Duplicate database events collapse on `(recipient_id, event_key)`, and the Edge Function atomically claims each delivery.
- Delivery status is stored per installation. Successful devices are not resent; temporary 429/5xx/network failures back off independently; invalid tokens become terminal and are removed. A notification is complete only when every delivery is sent or invalid.
- On Android 13+, permission is requested once after authentication. If denied, inbox storage, unread state, deep links opened in-app, and future permission changes continue to work.
