package com.expenso.app.core.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.expenso.app.MainActivity
import com.expenso.app.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.random.Random

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
        message: String
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.logo)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(Random.nextInt(10000), notification)
    }

    companion object {
        const val CHANNEL_PAYMENTS = "expenso_payments"
        const val CHANNEL_EXPENSES = "expenso_expenses"
        const val CHANNEL_GROUPS = "expenso_groups"
    }
}
