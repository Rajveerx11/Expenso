package com.expenso.app.data.repository

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.User
import com.expenso.app.domain.model.SignUpOutcome
import com.expenso.app.domain.repository.AuthRepository
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject

class AuthRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val credentialManager: CredentialManager
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
            Result.success(
                if (auth.currentUserOrNull() != null) {
                    SignUpOutcome.AUTHENTICATED
                } else {
                    SignUpOutcome.EMAIL_CONFIRMATION_REQUIRED
                }
            )
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
        return runCatching {
            require(idToken.isNotBlank()) { "Google did not return an ID token" }
            require(nonce.isNotBlank()) { "Google sign-in nonce is missing" }
            auth.signInWith(IDToken) {
                this.idToken = idToken
                provider = Google
                this.nonce = nonce
            }
        }
    }

    override suspend fun isLoggedIn(): Boolean {
        return try {
            auth.awaitInitialization()
            auth.sessionStatus.value is SessionStatus.Authenticated
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getCurrentUserId(): String? {
        return try {
            auth.currentUserOrNull()?.id
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun needsOnboarding(): Boolean {
        val completed = auth.currentUserOrNull()
            ?.userMetadata
            ?.get("onboarding_completed")
            ?.jsonPrimitive
            ?.booleanOrNull
        return completed != true
    }

    override suspend fun completeOnboarding(fullName: String, upiId: String?): Result<Unit> {
        return runCatching {
            val userId = requireNotNull(auth.currentUserOrNull()?.id) { "No authenticated user" }
            val normalizedName = fullName.trim()
            require(normalizedName.length in 2..100) { "Display name must be 2 to 100 characters" }

            postgrest["profiles"].update(
                buildJsonObject {
                    put("full_name", normalizedName)
                    put("upi_id", upiId?.trim()?.ifBlank { null })
                }
            ) {
                filter { eq("id", userId) }
            }

            auth.updateUser {
                data {
                    put("full_name", normalizedName)
                    put("onboarding_completed", true)
                }
            }
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
            auth.signOut()
            runCatching {
                credentialManager.clearCredentialState(ClearCredentialStateRequest())
            }
            Unit
        }
    }
}
