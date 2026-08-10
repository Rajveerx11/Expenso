package com.expenso.app.domain.repository

import com.expenso.app.domain.model.User
import com.expenso.app.domain.model.SignUpOutcome

interface AuthRepository {
    suspend fun signUp(email: String, password: String, fullName: String): Result<SignUpOutcome>
    suspend fun signIn(email: String, password: String): Result<Unit>
    suspend fun signInWithGoogle(idToken: String, nonce: String): Result<Unit>
    suspend fun isLoggedIn(): Boolean
    suspend fun needsOnboarding(): Boolean
    suspend fun completeOnboarding(fullName: String, upiId: String?): Result<Unit>
    suspend fun getCurrentUserId(): String?
    suspend fun getCurrentUser(): User?
    suspend fun signOut(): Result<Unit>
}
