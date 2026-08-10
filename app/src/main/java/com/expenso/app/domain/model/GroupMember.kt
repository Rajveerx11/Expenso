package com.expenso.app.domain.model

data class GroupMember(
    val id: String,
    val groupId: String,
    val userId: String,
    val role: String, // "admin" or "editor"
    val joinedAt: String,
    val userName: String = "",
    val userEmail: String = "",
    val userAvatarUrl: String? = null
)
