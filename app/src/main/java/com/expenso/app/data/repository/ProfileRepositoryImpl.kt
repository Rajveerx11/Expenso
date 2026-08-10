package com.expenso.app.data.repository

import com.expenso.app.core.util.Constants
import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.dto.ProfileUpdateDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.ProfileRepository
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import kotlinx.datetime.Clock
import javax.inject.Inject

class ProfileRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val storage: Storage
) : ProfileRepository {

    override suspend fun getProfile(userId: String): User? {
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

    override suspend fun updateProfile(
        userId: String,
        fullName: String?,
        avatarUrl: String?,
        upiId: String?
    ): Boolean {
        return try {
            val update = ProfileUpdateDto(
                fullName = fullName,
                avatarUrl = avatarUrl,
                upiId = upiId,
                updatedAt = Clock.System.now().toString()
            )
            postgrest["profiles"].update(update) {
                filter {
                    eq("id", userId)
                }
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun uploadAvatar(userId: String, imageBytes: ByteArray, extension: String): String? {
        return try {
            val path = "$userId/avatar.$extension"
            storage[Constants.AVATARS_BUCKET].upload(path, imageBytes) {
                upsert = true
            }
            storage[Constants.AVATARS_BUCKET].publicUrl(path)
        } catch (e: Exception) {
            null
        }
    }
}
