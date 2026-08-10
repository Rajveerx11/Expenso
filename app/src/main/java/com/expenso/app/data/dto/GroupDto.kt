package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GroupDto(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("created_by") val createdBy: String,
    @SerialName("default_currency") val defaultCurrency: String = "INR",
    @SerialName("simplified_debts") val simplifiedDebts: Boolean = true,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = ""
)

@Serializable
data class CreateGroupDto(
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("created_by") val createdBy: String
)

@Serializable
data class UpdateGroupDto(
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null
)
