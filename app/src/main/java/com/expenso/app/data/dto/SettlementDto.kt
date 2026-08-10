package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SettlementDto(
    @SerialName("id") val id: String,
    @SerialName("group_id") val groupId: String,
    @SerialName("payer_id") val payerId: String,
    @SerialName("receiver_id") val receiverId: String,
    @SerialName("amount") val amount: Double,
    @SerialName("status") val status: String,
    @SerialName("transaction_ref") val transactionRef: String? = null,
    @SerialName("confirmation_token") val confirmationToken: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("confirmed_at") val confirmedAt: String? = null
)

@Serializable
data class CreateSettlementDto(
    @SerialName("group_id") val groupId: String,
    @SerialName("payer_id") val payerId: String,
    @SerialName("receiver_id") val receiverId: String,
    @SerialName("amount") val amount: Double,
    @SerialName("status") val status: String,
    @SerialName("transaction_ref") val transactionRef: String? = null,
    @SerialName("confirmation_token") val confirmationToken: String? = null
)
