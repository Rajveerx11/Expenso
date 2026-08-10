package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BalanceResponseDto(
    @SerialName("user_id") val userId: String,
    @SerialName("balance") val balance: Double
)
