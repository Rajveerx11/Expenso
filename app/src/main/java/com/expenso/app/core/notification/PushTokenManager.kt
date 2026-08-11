package com.expenso.app.core.notification

import android.content.Context
import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

object PushTokenLifecycle {
    fun shouldRegister(
        currentUserId: String,
        token: String,
        registeredUserId: String?,
        registeredToken: String?
    ): Boolean = currentUserId != registeredUserId || token != registeredToken

    fun canCompleteUnregistration(serverRemoved: Boolean, firebaseInvalidated: Boolean): Boolean =
        serverRemoved || firebaseInvalidated
}

@Singleton
class PushTokenManager @Inject constructor(
    @ApplicationContext context: Context,
    private val auth: Auth,
    private val postgrest: Postgrest
) {
    private val preferences = context.getSharedPreferences("push_registration", Context.MODE_PRIVATE)

    suspend fun syncCurrentToken(): Result<Unit> = runCatching {
        retryPendingUnregistration().getOrThrow()
        registerToken(awaitFirebaseToken()).getOrThrow()
    }

    suspend fun registerToken(token: String): Result<Unit> = runCatching {
        check(!preferences.getBoolean(KEY_PENDING_UNREGISTRATION, false)) {
            "A previous push registration is still being removed"
        }
        preferences.edit().putString(KEY_CURRENT_TOKEN, token).apply()
        val userId = auth.currentUserOrNull()?.id ?: return@runCatching
        if (!PushTokenLifecycle.shouldRegister(
                currentUserId = userId,
                token = token,
                registeredUserId = preferences.getString(KEY_REGISTERED_USER, null),
                registeredToken = preferences.getString(KEY_REGISTERED_TOKEN, null)
            )
        ) return@runCatching

        postgrest.rpc(
            "register_push_token",
            buildJsonObject {
                put("token_param", token)
                put("installation_id_param", installationId())
                put("device_info_param", "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})")
            }
        )
        preferences.edit()
            .putString(KEY_REGISTERED_USER, userId)
            .putString(KEY_REGISTERED_TOKEN, token)
            .apply()
    }

    suspend fun unregisterCurrentDevice(): Result<Unit> {
        val serverRemoval = runCatching {
            check(auth.currentUserOrNull() != null) { "Authenticated session is unavailable" }
            postgrest.rpc(
                "unregister_push_token",
                buildJsonObject { put("installation_id_param", installationId()) }
            )
        }
        val firebaseRemoval = runCatching { awaitFirebaseTokenDeletion() }
        return if (PushTokenLifecycle.canCompleteUnregistration(serverRemoval.isSuccess, firebaseRemoval.isSuccess)) {
            clearRegistrationState()
            Result.success(Unit)
        } else {
            preferences.edit().putBoolean(KEY_PENDING_UNREGISTRATION, true).apply()
            Result.failure(serverRemoval.exceptionOrNull() ?: firebaseRemoval.exceptionOrNull()!!)
        }
    }

    suspend fun retryPendingUnregistration(): Result<Unit> {
        if (!preferences.getBoolean(KEY_PENDING_UNREGISTRATION, false)) return Result.success(Unit)
        val registeredUser = preferences.getString(KEY_REGISTERED_USER, null)
        val serverRemoval = runCatching {
            check(auth.currentUserOrNull()?.id == registeredUser) { "Original session is unavailable" }
            postgrest.rpc(
                "unregister_push_token",
                buildJsonObject { put("installation_id_param", installationId()) }
            )
        }
        val firebaseRemoval = runCatching { awaitFirebaseTokenDeletion() }
        return if (PushTokenLifecycle.canCompleteUnregistration(serverRemoval.isSuccess, firebaseRemoval.isSuccess)) {
            clearRegistrationState()
            Result.success(Unit)
        } else {
            Result.failure(serverRemoval.exceptionOrNull() ?: firebaseRemoval.exceptionOrNull()!!)
        }
    }

    private fun clearRegistrationState() {
        preferences.edit()
            .remove(KEY_REGISTERED_USER)
            .remove(KEY_REGISTERED_TOKEN)
            .remove(KEY_CURRENT_TOKEN)
            .remove(KEY_PENDING_UNREGISTRATION)
            .apply()
    }

    private fun installationId(): String {
        preferences.getString(KEY_INSTALLATION_ID, null)?.let { return it }
        return UUID.randomUUID().toString().also {
            preferences.edit().putString(KEY_INSTALLATION_ID, it).apply()
        }
    }

    private suspend fun awaitFirebaseToken(): String = suspendCoroutine { continuation ->
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful && !task.result.isNullOrBlank()) {
                    continuation.resume(task.result)
                } else {
                    continuation.resumeWithException(task.exception ?: IllegalStateException("FCM token unavailable"))
                }
            }
        } catch (error: Exception) {
            continuation.resumeWithException(error)
        }
    }

    private suspend fun awaitFirebaseTokenDeletion(): Unit = suspendCoroutine { continuation ->
        try {
            FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { task ->
                if (task.isSuccessful) continuation.resume(Unit)
                else continuation.resumeWithException(task.exception ?: IllegalStateException("FCM token deletion failed"))
            }
        } catch (error: Exception) {
            continuation.resumeWithException(error)
        }
    }

    private companion object {
        const val KEY_INSTALLATION_ID = "installation_id"
        const val KEY_CURRENT_TOKEN = "current_token"
        const val KEY_REGISTERED_USER = "registered_user"
        const val KEY_REGISTERED_TOKEN = "registered_token"
        const val KEY_PENDING_UNREGISTRATION = "pending_unregistration"
    }
}
