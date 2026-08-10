package com.expenso.app.domain.repository

import com.expenso.app.domain.model.AppNotification

interface NotificationRepository {
    suspend fun getNotifications(): Result<List<AppNotification>>
    suspend fun markRead(notificationId: String? = null): Result<Int>
}
