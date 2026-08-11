package com.expenso.app.core.auth

import java.security.SecureRandom
import java.security.MessageDigest
import java.util.Base64

data class GoogleNonce(val raw: String, val hashed: String)

object GoogleSignInNonce {
    fun generate(byteLength: Int = 32, secureRandom: SecureRandom = SecureRandom()): GoogleNonce {
        require(byteLength >= 16) { "Nonce must contain at least 128 bits of entropy" }
        val raw = ByteArray(byteLength)
            .also(secureRandom::nextBytes)
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        return GoogleNonce(raw = raw, hashed = sha256(raw))
    }

    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
