package com.expenso.app.ui.screen.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.domain.model.AppNotification
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.GlassBackground
import com.expenso.app.ui.theme.LightestIndigo
import com.expenso.app.ui.theme.MediumGrey
import com.expenso.app.ui.theme.NearBlack
import com.expenso.app.ui.theme.White

@Composable
fun NotificationScreen(
    onNavigateBack: () -> Unit,
    onOpenNotification: (AppNotification) -> Unit,
    viewModel: NotificationViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GlassBackground)
            .padding(top = 36.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text("Notifications", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = NearBlack)
            Spacer(Modifier.weight(1f))
            if (state.notifications.any { !it.isRead }) {
                IconButton(onClick = viewModel::markAllRead) {
                    Icon(Icons.Rounded.DoneAll, contentDescription = "Mark all read", tint = DeepIndigo)
                }
            }
        }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = DeepIndigo)
            }
            state.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.error.orEmpty(), color = MediumGrey)
            }
            state.notifications.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.NotificationsNone, null, tint = MediumGrey, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text("All caught up!", fontWeight = FontWeight.SemiBold, color = NearBlack)
                    Text("Group and payment updates appear here.", color = MediumGrey, fontSize = 13.sp)
                }
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(state.notifications, key = { it.id }) { notification ->
                    Card(
                        onClick = {
                            viewModel.markRead(notification.id)
                            onOpenNotification(notification)
                        },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (notification.isRead) White else LightestIndigo
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
                            if (!notification.isRead) {
                                Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(DeepIndigo))
                                Spacer(Modifier.size(10.dp))
                            }
                            Column(Modifier.weight(1f)) {
                                Text(notification.title, fontWeight = FontWeight.SemiBold, color = NearBlack)
                                Spacer(Modifier.height(4.dp))
                                Text(notification.message, color = MediumGrey, fontSize = 13.sp)
                                Spacer(Modifier.height(6.dp))
                                Text(notification.createdAt.take(10), color = MediumGrey, fontSize = 11.sp)
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}
