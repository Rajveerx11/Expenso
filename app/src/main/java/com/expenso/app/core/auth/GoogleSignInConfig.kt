package com.expenso.app.core.auth

object GoogleSignInConfig {
    private val webClientIdPattern =
        Regex("^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$")

    fun validatedWebClientId(value: String): String {
        val clientId = value.trim()
        require(webClientIdPattern.matches(clientId)) {
            "Google sign-in is unavailable in this build. Configure GOOGLE_WEB_CLIENT_ID."
        }
        return clientId
    }
}
