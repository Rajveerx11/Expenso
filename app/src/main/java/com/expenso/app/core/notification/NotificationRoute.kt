package com.expenso.app.core.notification

import com.expenso.app.domain.model.AppNotification
import java.net.URI
import java.util.UUID

data class PushPayload(
    val notificationId: String,
    val type: String,
    val title: String,
    val message: String,
    val deepLink: String
)

object NotificationRoute {
    fun fromData(data: Map<String, String>): PushPayload? {
        val id = data["notification_id"]?.takeIf(::isUuid) ?: return null
        val deepLink = data["deep_link"] ?: return null
        if (toAppRoute(deepLink) == null) return null
        return PushPayload(
            notificationId = id,
            type = data["type"].orEmpty(),
            title = data["title"]?.take(120).orEmpty().ifBlank { "Expenso" },
            message = data["message"]?.take(500).orEmpty(),
            deepLink = deepLink
        )
    }

    fun forNotification(notification: AppNotification): String {
        return if (notification.type == "settlement_request" && notification.groupId != null && notification.relatedId != null) {
            "settlement_confirmation/${notification.groupId}/${notification.relatedId}"
        } else if (notification.groupId != null) {
            "group_detail/${notification.groupId}"
        } else {
            "notifications"
        }
    }

    fun toAppRoute(deepLink: String?): String? {
        if (deepLink.isNullOrBlank()) return null
        val uri = runCatching { URI(deepLink) }.getOrNull() ?: return null
        if (uri.scheme != "expenso") return null
        val segments = uri.path.orEmpty().trim('/').split('/').filter(String::isNotBlank)
        return when (uri.host) {
            "group" -> segments.singleOrNull()?.takeIf(::isUuid)?.let { "group_detail/$it" }
            "settlement" -> if (segments.size == 2 && segments.all(::isUuid)) {
                "settlement_confirmation/${segments[0]}/${segments[1]}"
            } else null
            "notifications" -> if (segments.isEmpty()) "notifications" else null
            else -> null
        }
    }

    private fun isUuid(value: String): Boolean = runCatching { UUID.fromString(value) }.isSuccess
}
