package com.expenso.app.core.auth

object OnboardingValidator {
    private val upiPattern = Regex("^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$")

    fun validate(fullName: String, upiId: String?): String? {
        if (fullName.trim().length !in 2..100) {
            return "Display name must be 2 to 100 characters"
        }
        val normalizedUpi = upiId?.trim().orEmpty()
        if (normalizedUpi.isNotEmpty() && !upiPattern.matches(normalizedUpi)) {
            return "Enter a valid UPI ID, such as name@bank"
        }
        return null
    }
}
