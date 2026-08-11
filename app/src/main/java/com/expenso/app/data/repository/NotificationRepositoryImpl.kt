package com.expenso.app.data.repository

import com.expenso.app.data.dto.NotificationDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.AppNotification
import com.expenso.app.domain.repository.NotificationRepository
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

class NotificationRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest
) : NotificationRepository {
    override suspend fun getNotifications(): Result<List<AppNotification>> = runCatching {
        postgrest["notifications"]
            .select {
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList<NotificationDto>()
            .map(NotificationDto::toDomain)
    }

    override suspend fun markRead(notificationId: String?): Result<Int> = runCatching {
        val parameters = buildJsonObject {
            notificationId?.let { put("notification_id_param", it) }
        }
        postgrest.rpc("mark_notifications_read", parameters).decodeSingle<Int>()
    }
}
