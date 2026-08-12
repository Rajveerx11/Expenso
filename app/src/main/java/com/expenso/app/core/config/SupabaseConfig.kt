package com.expenso.app.core.config

data class ValidatedSupabaseConfig(val url: String, val publishableKey: String)

object SupabaseConfig {
    const val APPROVED_PROJECT_URL = "https://rspuqbcgjqezimwwpbzl.supabase.co"

    fun validate(url: String, publishableKey: String): ValidatedSupabaseConfig {
        require(url.trim().removeSuffix("/") == APPROVED_PROJECT_URL) {
            "Supabase URL does not match the approved Expenso project"
        }
        val key = publishableKey.trim()
        // Accept both: new publishable key format (sb_publishable_...) and legacy JWT anon keys (eyJ...)
        val isValidKey = key.matches(Regex("^sb_publishable_[A-Za-z0-9_-]{20,}$")) ||
            key.matches(Regex("^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$"))
        require(isValidKey) {
            "Supabase key is missing or invalid"
        }
        return ValidatedSupabaseConfig(APPROVED_PROJECT_URL, key)
    }
}
