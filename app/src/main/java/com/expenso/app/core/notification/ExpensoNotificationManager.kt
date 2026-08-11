package com.expenso.app.core.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import com.expenso.app.MainActivity
import com.expenso.app.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExpensoNotificationManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun showExpenseNotification(title: String, message: String) {
        showNotification(
            channelId = CHANNEL_EXPENSES,
            title = title,
            message = message
        )
    }

    fun show(payload: PushPayload) {
        showNotification(
            channelId = when {
                payload.type.startsWith("settlement_") -> CHANNEL_PAYMENTS
                payload.type == "expense_added" -> CHANNEL_EXPENSES
                else -> CHANNEL_GROUPS
            },
            title = payload.title,
            message = payload.message,
            deepLink = payload.deepLink,
            notificationId = payload.notificationId.hashCode()
        )
    }

    fun showPaymentNotification(title: String, message: String) {
        showNotification(
            channelId = CHANNEL_PAYMENTS,
            title = title,
            message = message
        )
    }

    fun showGroupNotification(title: String, message: String) {
        showNotification(
            channelId = CHANNEL_GROUPS,
            title = title,
            message = message
        )
    }

    private fun showNotification(
        channelId: String,
        title: String,
        message: String,
        deepLink: String? = null,
        notificationId: Int = (title + message).hashCode()
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            deepLink?.let {
                data = Uri.parse(it)
                putExtra("deep_link", it)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(notificationId, notification)
    }

    companion object {
        const val CHANNEL_PAYMENTS = "expenso_payments"
        const val CHANNEL_EXPENSES = "expenso_expenses"
        const val CHANNEL_GROUPS = "expenso_groups"
    }
}
