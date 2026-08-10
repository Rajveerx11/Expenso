package com.expenso.app.domain.model

data class Settlement(
    val id: String,
    val groupId: String,
    val payerId: String,
    val payerName: String = "",
    val receiverId: String,
    val receiverName: String = "",
    val amount: Double,
    val status: String, // "pending_confirmation", "confirmed", "rejected"
    val transactionRef: String?,
    val createdAt: String,
    val confirmedAt: String?
)
