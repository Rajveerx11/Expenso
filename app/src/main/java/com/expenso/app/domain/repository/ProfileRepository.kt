package com.expenso.app.domain.repository

import com.expenso.app.domain.model.User

interface ProfileRepository {
    suspend fun getProfile(userId: String): User?
    suspend fun updateProfile(userId: String, fullName: String?, avatarUrl: String?, upiId: String?): User?
    suspend fun uploadAvatar(userId: String, imageBytes: ByteArray, extension: String): String?
}
