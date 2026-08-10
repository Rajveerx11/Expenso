package com.expenso.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.expenso.app.core.notification.NotificationPermissionPolicy
import com.expenso.app.core.notification.PushTokenManager
import com.expenso.app.ui.navigation.ExpensoNavGraph
import com.expenso.app.ui.theme.ExpensoTheme
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var auth: Auth

    @Inject
    lateinit var pushTokenManager: PushTokenManager

    private var pendingDeepLink by mutableStateOf<String?>(null)
    private var isAuthenticated by mutableStateOf(false)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            enableEdgeToEdge()
        } catch (_: Exception) {}
        super.onCreate(savedInstanceState)
        pendingDeepLink = extractDeepLink(intent)

        lifecycleScope.launch {
            pushTokenManager.retryPendingUnregistration()
        }

        lifecycleScope.launch {
            auth.sessionStatus.collectLatest { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        isAuthenticated = true
                        pushTokenManager.syncCurrentToken()
                        requestNotificationPermissionOnce()
                    }
                    is SessionStatus.NotAuthenticated -> isAuthenticated = false
                    else -> {}
                }
            }
        }

        setContent {
            ExpensoTheme {
                ExpensoNavGraph(
                    pendingDeepLink = pendingDeepLink.takeIf { isAuthenticated },
                    onDeepLinkConsumed = { pendingDeepLink = null }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingDeepLink = extractDeepLink(intent)
    }

    private fun requestNotificationPermissionOnce() {
        val preferences = getSharedPreferences("notification_permission", MODE_PRIVATE)
        val isGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (NotificationPermissionPolicy.shouldRequest(
                sdkInt = Build.VERSION.SDK_INT,
                isAuthenticated = true,
                isGranted = isGranted,
                wasAlreadyRequested = preferences.getBoolean("requested", false)
            )
        ) {
            preferences.edit().putBoolean("requested", true).apply()
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun extractDeepLink(intent: Intent?): String? =
        intent?.dataString ?: intent?.getStringExtra("deep_link")
}
