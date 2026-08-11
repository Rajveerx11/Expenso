package com.expenso.app.domain.repository

import com.expenso.app.domain.model.User

interface AuthRepository {
    suspend fun signUp(email: String, password: String, fullName: String): Result<Unit>
    suspend fun signIn(email: String, password: String): Result<Unit>
    suspend fun isLoggedIn(): Boolean
    suspend fun getCurrentUserId(): String?
    suspend fun getCurrentUser(): User?
    suspend fun signOut(): Result<Unit>
}
