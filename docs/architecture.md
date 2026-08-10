# Expenso — Technical Architecture Document

> Deep-dive into the technical implementation, data layer, security model, and infrastructure.

---

## 1. Supabase Infrastructure

### 1.1 Project Configuration

| Setting | Value |
|---------|-------|
| **Project Name** | expenso |
| **Region** | South Asia (Mumbai) ap-south-1 |
| **Database** | PostgreSQL 15+ |
| **Auth** | Google OAuth only |
| **Storage** | 2 buckets: `avatars`, `group-images` |
| **Realtime** | Enabled for `settlements`, `payment_confirmations` |
| **Edge Functions** | `send-notification` (FCM bridge) |

### 1.2 Storage Buckets

#### `avatars` Bucket
```
Policy: Authenticated users can upload to their own folder
Path Pattern: {user_id}/avatar.{ext}
Max Size: 5MB
Allowed Types: image/jpeg, image/png, image/webp
Public: Yes (for reading profile photos)
```

#### `group-images` Bucket
```
Policy: Group admin can upload to group folder
Path Pattern: {group_id}/cover.{ext}
Max Size: 5MB
Allowed Types: image/jpeg, image/png, image/webp
Public: Yes (for displaying group images)
```

### 1.3 Complete SQL Schema

```sql
-- ============================================
-- PROFILES TABLE
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    upi_id TEXT,
    total_income NUMERIC(12,2) DEFAULT 0,
    total_balance NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PERSONAL EXPENSES TABLE
-- ============================================
CREATE TABLE public.personal_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL DEFAULT 'Other',
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    note TEXT,
    source_group_expense_id UUID, -- nullable, links to group_expenses.id
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_personal_expenses_user ON personal_expenses(user_id);
CREATE INDEX idx_personal_expenses_date ON personal_expenses(user_id, expense_date DESC);
CREATE INDEX idx_personal_expenses_type ON personal_expenses(user_id, type);

-- ============================================
-- GROUPS TABLE
-- ============================================
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    default_currency TEXT DEFAULT 'INR',
    simplified_debts BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GROUP MEMBERS TABLE
-- ============================================
CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);

-- ============================================
-- GROUP EXPENSES TABLE
-- ============================================
CREATE TABLE public.group_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    paid_by UUID NOT NULL REFERENCES public.profiles(id),
    title TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
    category TEXT NOT NULL DEFAULT 'Other',
    split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage')),
    note TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_group_expenses_group ON group_expenses(group_id);

-- ============================================
-- EXPENSE SPLITS TABLE
-- ============================================
CREATE TABLE public.expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    owed_amount NUMERIC(12,2) NOT NULL CHECK (owed_amount >= 0),
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMPTZ,
    UNIQUE(expense_id, user_id)
);

CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);

-- ============================================
-- SETTLEMENTS TABLE
-- ============================================
CREATE TABLE public.settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id),
    payer_id UUID NOT NULL REFERENCES public.profiles(id),
    receiver_id UUID NOT NULL REFERENCES public.profiles(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending_confirmation' 
        CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')),
    transaction_ref TEXT UNIQUE,
    confirmation_token UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_settlements_payer ON settlements(payer_id);
CREATE INDEX idx_settlements_receiver ON settlements(receiver_id);
CREATE INDEX idx_settlements_status ON settlements(status);

-- ============================================
-- PAYMENT CONFIRMATIONS TABLE
-- ============================================
CREATE TABLE public.payment_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id),
    receiver_id UUID NOT NULL REFERENCES public.profiles(id),
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'confirmed', 'rejected')),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_conf_receiver ON payment_confirmations(receiver_id, status);

-- ============================================
-- FCM TOKENS TABLE
-- ============================================
CREATE TABLE public.user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fcm_token)
);

CREATE INDEX idx_fcm_tokens_user ON user_fcm_tokens(user_id);
```

### 1.4 PostgreSQL Functions

```sql
-- ============================================
-- FUNCTION: Calculate net balances in a group
-- Returns who owes whom and how much
-- ============================================
CREATE OR REPLACE FUNCTION public.get_group_balances(p_group_id UUID, p_user_id UUID)
RETURNS TABLE (
    member_id UUID,
    member_name TEXT,
    member_avatar TEXT,
    member_upi_id TEXT,
    net_balance NUMERIC(12,2),
    direction TEXT -- 'owes_you' (green), 'you_owe' (red), 'settled' (grey)
) AS $$
BEGIN
    RETURN QUERY
    WITH member_list AS (
        SELECT gm.user_id, p.full_name, p.avatar_url, p.upi_id
        FROM group_members gm
        JOIN profiles p ON p.id = gm.user_id
        WHERE gm.group_id = p_group_id AND gm.user_id != p_user_id
    ),
    -- What others owe current user (expenses paid by current user)
    others_owe_me AS (
        SELECT es.user_id AS other_user, SUM(es.owed_amount) AS amount
        FROM group_expenses ge
        JOIN expense_splits es ON es.expense_id = ge.id
        WHERE ge.group_id = p_group_id 
            AND ge.paid_by = p_user_id
            AND es.user_id != p_user_id
            AND es.is_settled = FALSE
        GROUP BY es.user_id
    ),
    -- What current user owes others (expenses paid by others)
    i_owe_others AS (
        SELECT ge.paid_by AS other_user, SUM(es.owed_amount) AS amount
        FROM group_expenses ge
        JOIN expense_splits es ON es.expense_id = ge.id
        WHERE ge.group_id = p_group_id 
            AND es.user_id = p_user_id
            AND ge.paid_by != p_user_id
            AND es.is_settled = FALSE
        GROUP BY ge.paid_by
    ),
    -- Confirmed settlements where I received money
    received_settlements AS (
        SELECT s.payer_id AS other_user, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id = p_group_id
            AND s.receiver_id = p_user_id
            AND s.status = 'confirmed'
        GROUP BY s.payer_id
    ),
    -- Confirmed settlements where I paid money
    sent_settlements AS (
        SELECT s.receiver_id AS other_user, SUM(s.amount) AS amount
        FROM settlements s
        WHERE s.group_id = p_group_id
            AND s.payer_id = p_user_id
            AND s.status = 'confirmed'
        GROUP BY s.receiver_id
    )
    SELECT 
        ml.user_id,
        ml.full_name,
        ml.avatar_url,
        ml.upi_id,
        COALESCE(oom.amount, 0) - COALESCE(ioo.amount, 0) 
        + COALESCE(rs.amount, 0) - COALESCE(ss.amount, 0) AS net_balance,
        CASE 
            WHEN COALESCE(oom.amount, 0) - COALESCE(ioo.amount, 0) 
                 + COALESCE(rs.amount, 0) - COALESCE(ss.amount, 0) > 0 THEN 'owes_you'
            WHEN COALESCE(oom.amount, 0) - COALESCE(ioo.amount, 0) 
                 + COALESCE(rs.amount, 0) - COALESCE(ss.amount, 0) < 0 THEN 'you_owe'
            ELSE 'settled'
        END AS direction
    FROM member_list ml
    LEFT JOIN others_owe_me oom ON oom.other_user = ml.user_id
    LEFT JOIN i_owe_others ioo ON ioo.other_user = ml.user_id
    LEFT JOIN received_settlements rs ON rs.other_user = ml.user_id
    LEFT JOIN sent_settlements ss ON ss.other_user = ml.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Confirm a payment settlement
-- Atomically updates all related records
-- ============================================
CREATE OR REPLACE FUNCTION public.confirm_settlement(
    p_confirmation_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_settlement settlements%ROWTYPE;
    v_confirmation payment_confirmations%ROWTYPE;
BEGIN
    -- Get the confirmation record
    SELECT * INTO v_confirmation 
    FROM payment_confirmations 
    WHERE id = p_confirmation_id AND receiver_id = p_user_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid confirmation or already processed';
    END IF;
    
    -- Get the settlement
    SELECT * INTO v_settlement 
    FROM settlements 
    WHERE id = v_confirmation.settlement_id;
    
    -- Update settlement status
    UPDATE settlements 
    SET status = 'confirmed', confirmed_at = NOW()
    WHERE id = v_settlement.id;
    
    -- Update confirmation status
    UPDATE payment_confirmations 
    SET status = 'confirmed', responded_at = NOW()
    WHERE id = p_confirmation_id;
    
    -- Update payer's balance (they paid, so minus from their balance)
    UPDATE profiles 
    SET total_balance = total_balance - v_settlement.amount,
        updated_at = NOW()
    WHERE id = v_settlement.payer_id;
    
    -- Update receiver's balance (they received, so add to their balance)
    UPDATE profiles 
    SET total_balance = total_balance + v_settlement.amount,
        updated_at = NOW()
    WHERE id = v_settlement.receiver_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Recalculate user's personal balance
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_balance(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC(12,2);
BEGIN
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM personal_expenses
    WHERE user_id = p_user_id;
    
    UPDATE profiles 
    SET total_balance = v_balance, updated_at = NOW()
    WHERE id = p_user_id;
    
    RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get total owe summary across all groups
-- ============================================
CREATE OR REPLACE FUNCTION public.get_total_owe_summary(p_user_id UUID)
RETURNS TABLE (
    total_you_owe NUMERIC(12,2),
    total_owed_to_you NUMERIC(12,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH all_balances AS (
        SELECT gb.net_balance
        FROM group_members gm
        CROSS JOIN LATERAL get_group_balances(gm.group_id, p_user_id) gb
        WHERE gm.user_id = p_user_id
    )
    SELECT 
        ABS(COALESCE(SUM(CASE WHEN net_balance < 0 THEN net_balance END), 0)),
        COALESCE(SUM(CASE WHEN net_balance > 0 THEN net_balance END), 0)
    FROM all_balances;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.5 Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view all profiles" ON profiles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- PERSONAL EXPENSES
CREATE POLICY "Users can CRUD own expenses" ON personal_expenses
    FOR ALL USING (user_id = auth.uid());

-- GROUPS
CREATE POLICY "Members can view their groups" ON groups
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
    );

CREATE POLICY "Authenticated users can create groups" ON groups
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Only creator can update group" ON groups
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Only creator can delete group" ON groups
    FOR DELETE USING (created_by = auth.uid());

-- GROUP MEMBERS
CREATE POLICY "Members can view group members" ON group_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = group_members.group_id AND gm2.user_id = auth.uid())
    );

CREATE POLICY "Admin can manage members" ON group_members
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin')
        OR user_id = auth.uid() -- Allow self-insert for group creation
    );

CREATE POLICY "Admin can remove members" ON group_members
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = group_members.group_id AND gm2.user_id = auth.uid() AND gm2.role = 'admin')
    );

-- GROUP EXPENSES
CREATE POLICY "Members can view group expenses" ON group_expenses
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = group_expenses.group_id AND user_id = auth.uid())
    );

CREATE POLICY "Members can add expenses" ON group_expenses
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM group_members WHERE group_id = group_expenses.group_id AND user_id = auth.uid())
    );

CREATE POLICY "Users can update own expenses" ON group_expenses
    FOR UPDATE USING (paid_by = auth.uid());

CREATE POLICY "Users can delete own expenses" ON group_expenses
    FOR DELETE USING (paid_by = auth.uid());

-- EXPENSE SPLITS
CREATE POLICY "Members can view splits" ON expense_splits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_expenses ge 
            JOIN group_members gm ON gm.group_id = ge.group_id
            WHERE ge.id = expense_splits.expense_id AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can insert splits" ON expense_splits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_expenses ge 
            JOIN group_members gm ON gm.group_id = ge.group_id
            WHERE ge.id = expense_splits.expense_id AND gm.user_id = auth.uid()
        )
    );

-- SETTLEMENTS
CREATE POLICY "Involved users can view settlements" ON settlements
    FOR SELECT USING (payer_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Payer can create settlement" ON settlements
    FOR INSERT WITH CHECK (payer_id = auth.uid());

CREATE POLICY "Involved can update settlement" ON settlements
    FOR UPDATE USING (payer_id = auth.uid() OR receiver_id = auth.uid());

-- PAYMENT CONFIRMATIONS
CREATE POLICY "Involved users can view confirmations" ON payment_confirmations
    FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Sender can create confirmation" ON payment_confirmations
    FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Receiver can update confirmation" ON payment_confirmations
    FOR UPDATE USING (receiver_id = auth.uid());

-- FCM TOKENS
CREATE POLICY "Users manage own tokens" ON user_fcm_tokens
    FOR ALL USING (user_id = auth.uid());
```

### 1.6 Supabase Edge Function: `send-notification`

```typescript
// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Firebase Admin SDK equivalent for Deno
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

interface NotificationPayload {
  type: "payment_confirmation" | "expense_added" | "member_added" | "payment_result";
  recipient_user_id: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json();
    
    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Get FCM token for recipient
    const { data: tokens, error } = await supabase
      .from("user_fcm_tokens")
      .select("fcm_token")
      .eq("user_id", payload.recipient_user_id);
    
    if (error || !tokens?.length) {
      return new Response(JSON.stringify({ error: "No FCM token found" }), {
        status: 404,
      });
    }
    
    // Get OAuth2 access token for FCM v1 API
    const accessToken = await getFirebaseAccessToken(SERVICE_ACCOUNT);
    
    // Send to all user devices
    const results = await Promise.all(
      tokens.map(async (tokenRow) => {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: tokenRow.fcm_token,
                notification: {
                  title: payload.title,
                  body: payload.body,
                },
                data: payload.data,
                android: {
                  priority: "high",
                  notification: {
                    channel_id: "expenso_payments",
                    click_action: "OPEN_CONFIRMATION",
                  },
                },
              },
            }),
          }
        );
        return response.json();
      })
    );
    
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});

// Helper: Get Firebase access token using service account
async function getFirebaseAccessToken(serviceAccount: any): Promise<string> {
  // JWT creation and token exchange logic
  // ... (implementation details)
  const jwt = await createJWT(serviceAccount);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await response.json();
  return data.access_token;
}
```

---

## 2. Android Dependencies

### `build.gradle.kts` (Project-level)
```kotlin
plugins {
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.0" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.0" apply false
}
```

### `build.gradle.kts` (App-level)
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("com.google.gms.google-services")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
    kotlin("kapt")
}

android {
    namespace = "com.expenso.app"
    compileSdk = 35
    
    defaultConfig {
        applicationId = "com.expenso.app"
        minSdk = 26  // Android 8.0+
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
    
    buildFeatures {
        compose = true
    }
}

dependencies {
    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    
    // Supabase
    val supabaseBom = platform("io.github.jan-tennert.supabase:bom:3.0.0")
    implementation(supabaseBom)
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")
    implementation("io.github.jan-tennert.supabase:compose-auth")
    
    // Ktor (HTTP client for Supabase)
    implementation("io.ktor:ktor-client-android:2.3.12")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")
    
    // Hilt DI
    implementation("com.google.dagger:hilt-android:2.51.1")
    kapt("com.google.dagger:hilt-compiler:2.51.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    
    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:33.1.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    
    // Google Credential Manager (for native Google Sign-In)
    implementation("androidx.credentials:credentials:1.2.2")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.2")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    
    // Coil (Image loading)
    implementation("io.coil-kt:coil-compose:2.6.0")
    
    // Haze (Glassmorphism blur)
    implementation("dev.chrisbanes.haze:haze:0.9.0-beta01")
    implementation("dev.chrisbanes.haze:haze-materials:0.9.0-beta01")
    
    // Kotlinx
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
    implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.0")
    
    // Accompanist (system UI controller)
    implementation("com.google.accompanist:accompanist-systemuicontroller:0.34.0")
    
    // Splash Screen API
    implementation("androidx.core:core-splashscreen:1.0.1")
}
```

---

## 3. Key Technical Decisions

### 3.1 Why No Room Database (v1)?
- **Supabase is the single source of truth** — simplifies data consistency
- **Realtime subscriptions** keep UI updated without local caching complexity
- **Trade-off**: Requires internet connection (acceptable for v1)
- **v2 plan**: Add Room as offline cache with sync queue

### 3.2 Why Hilt over Koin?
- **Official Google recommendation** for Android DI
- **Compile-time verification** catches dependency issues at build time
- **Better ViewModel integration** with `@HiltViewModel`
- Slightly more boilerplate but more robust for production apps

### 3.3 Why Haze Library for Glassmorphism?
- **Chris Banes** (ex-Google Android team) is the author — high quality
- **Handles API level differences** automatically (fallback for pre-API 31)
- **Compose-native** — works with Modifier chain
- **Hardware-accelerated** on supported devices

### 3.4 Why Edge Functions over Database Triggers for FCM?
- **Decoupling**: Heavy FCM logic doesn't block database transactions
- **Error isolation**: FCM failures don't rollback expense additions
- **Testability**: Edge Functions can be tested independently
- **Flexibility**: Easy to add rate limiting, batching, or additional notification channels

---

## 4. Realtime Subscriptions

The app subscribes to real-time changes for live updates:

```kotlin
// Subscribe to payment confirmations for the current user
supabase.realtime.channel("payment-confirmations")
    .postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
        table = "payment_confirmations"
        filter = "receiver_id=eq.${currentUserId}"
    }
    .collect { change ->
        // Show in-app dialog when a payment confirmation arrives
        showPaymentConfirmationDialog(change.record)
    }

// Subscribe to settlements status changes
supabase.realtime.channel("settlements")
    .postgresChangeFlow<PostgresAction.Update>(schema = "public") {
        table = "settlements"
        filter = "payer_id=eq.${currentUserId}"
    }
    .collect { change ->
        // Update UI when settlement is confirmed/rejected
        refreshGroupBalances()
    }
```

---

## 5. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **SQL Injection** | Supabase client uses parameterized queries |
| **Unauthorized data access** | RLS policies enforce user-level access |
| **FCM token exposure** | Tokens stored server-side, RLS limits to own tokens |
| **UPI ID exposure** | Visible only to group members (RLS) |
| **Payment fraud** | Two-party confirmation required, no auto-settlement |
| **Profile photo abuse** | File size limits, type checking on upload |
| **Session hijacking** | Supabase handles JWT refresh, HTTPS only |
| **Rate limiting** | Supabase built-in rate limits on auth and API |
