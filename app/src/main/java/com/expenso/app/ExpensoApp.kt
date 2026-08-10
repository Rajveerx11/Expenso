package com.expenso.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import dagger.hilt.android.HiltAndroidApp
import java.io.PrintWriter
import java.io.StringWriter

@HiltAndroidApp
class ExpensoApp : Application() {

    override fun onCreate() {
        // Register global crash handler before anything else
        Thread.setDefaultUncaughtExceptionHandler { _, throwable ->
            val sw = StringWriter()
            throwable.printStackTrace(PrintWriter(sw))
            val stacktrace = sw.toString()

            try {
                val intent = Intent(this, CrashActivity::class.java).apply {
                    putExtra("stacktrace", stacktrace)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            android.os.Process.killProcess(android.os.Process.myPid())
            System.exit(10)
        }

        super.onCreate()

        try {
            createNotificationChannels()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = listOf(
                NotificationChannel(
                    "expenso_payments",
                    "Payments",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Payment confirmations and settlement updates"
                },
                NotificationChannel(
                    "expenso_expenses",
                    "Expenses",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "New expense notifications"
                },
                NotificationChannel(
                    "expenso_groups",
                    "Groups",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Group activity notifications"
                }
            )
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.let { manager ->
                channels.forEach { manager.createNotificationChannel(it) }
            }
        }
    }
}
