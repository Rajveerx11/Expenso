package com.expenso.app

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.expenso.app.core.notification.RealtimeNotificationListener
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
    lateinit var realtimeListener: RealtimeNotificationListener

    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            enableEdgeToEdge()
        } catch (_: Exception) {}
        super.onCreate(savedInstanceState)

        // Start realtime notifications when user is authenticated
        lifecycleScope.launch {
            auth.sessionStatus.collectLatest { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        val userId = status.session.user?.id
                        if (userId != null) {
                            realtimeListener.startListening(userId)
                        }
                    }
                    is SessionStatus.NotAuthenticated -> {
                        realtimeListener.stopListening()
                    }
                    else -> {}
                }
            }
        }

        setContent {
            ExpensoTheme {
                ExpensoNavGraph()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        realtimeListener.stopListening()
    }
}
