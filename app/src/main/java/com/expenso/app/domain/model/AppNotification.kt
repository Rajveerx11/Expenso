package com.expenso.app.domain.model

data class AppNotification(
    val id: String,
    val title: String,
    val message: String,
    val type: String, // "expense_added", "settlement_request", "settlement_confirmed", "group_invite"
    val relatedId: String?,
    val isRead: Boolean,
    val createdAt: String
)
