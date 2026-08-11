package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    @SerialName("group_id") val groupId: String? = null,
    @SerialName("related_id") val relatedId: String? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String
)
