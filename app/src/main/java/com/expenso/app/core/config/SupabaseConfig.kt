package com.expenso.app.core.config

data class ValidatedSupabaseConfig(val url: String, val publishableKey: String)

object SupabaseConfig {
    const val APPROVED_PROJECT_URL = "https://rspuqbcgjqezimwwpbzl.supabase.co"

    fun validate(url: String, publishableKey: String): ValidatedSupabaseConfig {
        require(url.trim().removeSuffix("/") == APPROVED_PROJECT_URL) {
            "Supabase URL does not match the approved Expenso project"
        }
        val key = publishableKey.trim()
        val isPublishable = key.matches(Regex("^sb_publishable_[A-Za-z0-9_-]{20,}$"))
        require(isPublishable) {
            "Supabase publishable key is missing or invalid"
        }
        return ValidatedSupabaseConfig(APPROVED_PROJECT_URL, key)
    }
}
