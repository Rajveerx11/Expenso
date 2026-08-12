package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProfileDto(
    val id: String,
    val email: String,
    @SerialName("full_name")
    val fullName: String,
    @SerialName("avatar_url")
    val avatarUrl: String? = null,
    @SerialName("upi_id")
    val upiId: String? = null,
    @SerialName("total_income")
    val totalIncome: Double = 0.0,
    @SerialName("total_balance")
    val totalBalance: Double = 0.0,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("updated_at")
    val updatedAt: String? = null
)
