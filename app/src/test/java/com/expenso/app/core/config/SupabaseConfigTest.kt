package com.expenso.app.core.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SupabaseConfigTest {
    @Test
    fun `accepts approved project and publishable key`() {
        val key = "sb_" + "publishable_" + "abcdefghijklmnopqrstuvwxyz"
        val config = SupabaseConfig.validate(SupabaseConfig.APPROVED_PROJECT_URL, key)
        assertEquals(SupabaseConfig.APPROVED_PROJECT_URL, config.url)
        assertEquals(key, config.publishableKey)
    }

    @Test
    fun `rejects any other project URL`() {
        val error = runCatching {
            SupabaseConfig.validate(
                "https://other-project.supabase.co",
                "sb_" + "publishable_" + "abcdefghijklmnopqrstuvwxyz"
            )
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals("Supabase URL does not match the approved Expenso project", error?.message)
    }

    @Test
    fun `rejects missing secret and legacy JWT values without echoing them`() {
        val legacyServiceRoleJwt = listOf(
            "eyJhbGciOiJIUzI1NiJ9",
            "eyJyb2xlIjoic2VydmljZV9yb2xlIiwicmVmIjoicnNwdXFiY2dqcWV6aW13d3BienoifQ",
            "signature_value_long_enough"
        ).joinToString(".")
        listOf(
            "",
            "sb_" + "secret_" + "abcdefghijklmnopqrstuvwxyz",
            "service_role_value",
            legacyServiceRoleJwt
        ).forEach { value ->
            val error = runCatching {
                SupabaseConfig.validate(SupabaseConfig.APPROVED_PROJECT_URL, value)
            }.exceptionOrNull()
            assertTrue(error is IllegalArgumentException)
            assertEquals("Supabase publishable key is missing or invalid", error?.message)
        }
    }
}
