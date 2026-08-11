# Google authentication setup

Expenso uses Android Credential Manager to obtain a Google ID token, then
exchanges that token with Supabase Auth. The Android app never receives or
stores a Google client secret.

1. Create an Android OAuth client for package `com.expenso.app` and the signing
   certificate SHA-1/SHA-256 fingerprints.
2. Create a Web OAuth client. Put its client ID in the ignored
   `local.properties` file as `GOOGLE_WEB_CLIENT_ID=...`.
3. In Supabase Authentication > Providers > Google, enable Google and configure
   the Web client ID and secret.
4. Build the app. A blank client ID leaves email/password auth available and
   shows a clear configuration error if Google sign-in is selected.

The first authenticated session is routed through profile onboarding. Expenso
stores the completion marker in Supabase Auth user metadata and keeps the
display name and optional UPI ID in the RLS-protected `profiles` row.

For release builds, register the Play App Signing certificate fingerprints as
well as local debug fingerprints. Signing configuration and OAuth secrets must
not be committed.
