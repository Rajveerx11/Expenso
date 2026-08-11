package com.expenso.app.core.notification

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class ExpensoMessagingService : FirebaseMessagingService() {
    @Inject lateinit var tokenManager: PushTokenManager
    @Inject lateinit var notificationManager: ExpensoNotificationManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { tokenManager.registerToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        NotificationRoute.fromData(message.data)?.let(notificationManager::show)
    }
}
