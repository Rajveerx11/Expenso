package com.expenso.app.domain.model

data class AppNotification(
    val id: String,
    val title: String,
    val message: String,
    val type: String,
    val groupId: String?,
    val relatedId: String?,
    val isRead: Boolean,
    val createdAt: String
)
