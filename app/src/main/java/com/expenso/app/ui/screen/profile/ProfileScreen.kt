package com.expenso.app.ui.screen.profile

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Payment
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.components.AvatarImage
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.theme.DarkGrey
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.EmeraldGreen
import com.expenso.app.ui.theme.LightestIndigo
import com.expenso.app.ui.theme.MediumGrey
import com.expenso.app.ui.theme.NearBlack
import com.expenso.app.ui.theme.RoseRed
import com.expenso.app.ui.theme.SoftGreen
import com.expenso.app.ui.theme.SoftRed
import com.expenso.app.ui.theme.GlassBackground
import com.expenso.app.ui.theme.White
import java.text.NumberFormat
import java.util.Locale
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

@Composable
fun ProfileScreen(
    onNavigateToEditProfile: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onSignOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val currencyFormat = remember { NumberFormat.getCurrencyInstance(Locale("en", "IN")) }
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.loadProfile()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(GlassBackground)
    ) {
        if (uiState.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = DeepIndigo
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .statusBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(top = 24.dp, bottom = 32.dp)
            ) {
                Text(
                    text = "Profile",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = NearBlack
                )
                Spacer(modifier = Modifier.height(24.dp))

                GlassCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        AvatarImage(
                            imageUrl = uiState.user?.avatarUrl,
                            name = uiState.user?.fullName ?: "User",
                            size = 80.dp
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = uiState.user?.fullName ?: "Loading...",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NearBlack
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = uiState.user?.email ?: "",
                            fontSize = 13.sp,
                            color = MediumGrey
                        )
                        if (!uiState.user?.upiId.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Rounded.Payment,
                                    contentDescription = null,
                                    tint = MediumGrey,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = uiState.user?.upiId ?: "",
                                    fontSize = 13.sp,
                                    color = MediumGrey
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))

                        Card(
                            onClick = onNavigateToEditProfile,
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = LightestIndigo
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Rounded.Edit,
                                    contentDescription = null,
                                    tint = DeepIndigo,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Edit Profile",
                                    color = DeepIndigo,
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = "Financial Summary",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NearBlack
                )
                Spacer(modifier = Modifier.height(12.dp))

                FinanceRow(
                    icon = Icons.AutoMirrored.Rounded.TrendingUp,
                    label = "Total Income",
                    value = currencyFormat.format(uiState.user?.totalIncome ?: 0.0),
                    iconColor = EmeraldGreen,
                    bgColor = SoftGreen
                )
                Spacer(modifier = Modifier.height(8.dp))
                FinanceRow(
                    icon = Icons.AutoMirrored.Rounded.TrendingDown,
                    label = "Total Expenses",
                    value = currencyFormat.format(
                        (uiState.user?.totalIncome ?: 0.0) - (uiState.user?.totalBalance ?: 0.0)
                    ),
                    iconColor = RoseRed,
                    bgColor = SoftRed
                )
                Spacer(modifier = Modifier.height(8.dp))
                FinanceRow(
                    icon = Icons.Rounded.AccountBalanceWallet,
                    label = "Net Balance",
                    value = currencyFormat.format(uiState.user?.totalBalance ?: 0.0),
                    iconColor = DeepIndigo,
                    bgColor = LightestIndigo
                )

                Spacer(modifier = Modifier.height(24.dp))

                Card(
                    onClick = onNavigateToNotifications,
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = LightestIndigo),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.Notifications, null, tint = DeepIndigo, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Notifications", color = DeepIndigo, fontWeight = FontWeight.Medium)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Card(
                    onClick = { viewModel.signOut(onSignOut) },
                    enabled = !uiState.isSigningOut,
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = SoftRed
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.AutoMirrored.Rounded.ExitToApp,
                            contentDescription = null,
                            tint = RoseRed,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = if (uiState.isSigningOut) "Signing Out..." else "Sign Out",
                            color = RoseRed,
                            fontWeight = FontWeight.Medium,
                            fontSize = 15.sp
                        )
                    }
                }
                uiState.error?.let { error ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(text = error, color = RoseRed, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun FinanceRow(
    icon: ImageVector,
    label: String,
    value: String,
    iconColor: Color,
    bgColor: Color
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = label,
                    fontSize = 14.sp,
                    color = DarkGrey
                )
            }
            Text(
                text = value,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = NearBlack
            )
        }
    }
}
