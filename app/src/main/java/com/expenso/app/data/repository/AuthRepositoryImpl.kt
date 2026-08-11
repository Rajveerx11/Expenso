package com.expenso.app.data.repository

import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.SignUpOutcome
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.core.notification.PushTokenManager
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

class AuthRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val pushTokenManager: PushTokenManager
) : AuthRepository {

    override suspend fun signUp(email: String, password: String, fullName: String): Result<SignUpOutcome> {
        return try {
            auth.signUpWith(Email) {
                this.email = email
                this.password = password
                this.data = buildJsonObject {
                    put("full_name", fullName)
                }
            }
            // If user is authenticated after signup, email confirmation is not required
            val outcome = if (auth.currentUserOrNull() != null) {
                SignUpOutcome.AUTHENTICATED
            } else {
                SignUpOutcome.EMAIL_CONFIRMATION_REQUIRED
            }
            Result.success(outcome)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun signIn(email: String, password: String): Result<Unit> {
        return try {
            auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun signInWithGoogle(idToken: String, nonce: String): Result<Unit> {
        return try {
            auth.signInWith(IDToken) {
                this.idToken = idToken
                this.nonce = nonce
                this.provider = io.github.jan.supabase.auth.providers.Google
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun isLoggedIn(): Boolean {
        return try {
            auth.sessionStatus.value is SessionStatus.Authenticated
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun needsOnboarding(): Boolean {
        return try {
            val userId = auth.currentUserOrNull()?.id ?: return false
            val profile = postgrest["profiles"].select {
                filter { eq("id", userId) }
            }.decodeSingleOrNull<ProfileDto>()
            // Needs onboarding if profile doesn't exist or full_name is blank
            profile == null || profile.fullName.isBlank()
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun completeOnboarding(fullName: String, upiId: String?): Result<Unit> {
        return try {
            val userId = auth.currentUserOrNull()?.id
                ?: return Result.failure(Exception("Not signed in"))
            postgrest["profiles"].upsert(buildJsonObject {
                put("id", userId)
                put("full_name", fullName)
                if (upiId != null) put("upi_id", upiId)
            })
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun getCurrentUserId(): String? {
        return try {
            auth.currentUserOrNull()?.id
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun getCurrentUser(): User? {
        val userId = getCurrentUserId() ?: return null
        return try {
            postgrest["profiles"]
                .select {
                    filter {
                        eq("id", userId)
                    }
                }
                .decodeSingleOrNull<ProfileDto>()
                ?.toDomain()
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun signOut(): Result<Unit> {
        return runCatching {
            try { pushTokenManager.unregisterCurrentDevice().getOrThrow() } catch (_: Exception) {}
            auth.signOut()
        }
    }
}
