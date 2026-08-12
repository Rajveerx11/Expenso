# Google authentication setup

Expenso uses Android Credential Manager to obtain a Google ID token, then
exchanges that token with Supabase Auth. The Android app never receives or
stores a Google client secret.

1. Create an Android OAuth client for package `com.expenso.app` and the signing
   certificate SHA-1/SHA-256 fingerprints.
2. Create a Web OAuth client. Put its client ID in the ignored
   `local.properties` file as `GOOGLE_WEB_CLIENT_ID=...`, pass it as a Gradle
   property (`-PGOOGLE_WEB_CLIENT_ID=...`), or expose the same environment
   variable in CI. Resolution uses that order: Gradle property, environment,
   then local properties.
3. In Supabase Authentication > Providers > Google, enable Google and configure
   the Web client ID and secret.
4. Debug builds may omit the client ID so email/password development remains
   available; tapping Google then shows a clear configuration error. Release
   build tasks fail before compilation when the client ID is missing or is not
   a Web OAuth client ID ending in `.apps.googleusercontent.com`.

`google-services.json` configures Firebase services such as FCM. Credential
Manager Google sign-in uses the Web OAuth client ID above and does not read the
Firebase file for this value.

The first authenticated session is routed through profile onboarding. Expenso
stores the completion marker in Supabase Auth user metadata and keeps the
display name and optional UPI ID in the RLS-protected `profiles` row.

For release builds, register the Play App Signing certificate fingerprints as
well as local debug fingerprints. Signing configuration and OAuth secrets must
not be committed.
