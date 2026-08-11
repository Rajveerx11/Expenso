package com.expenso.app.ui.screen.settlement

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.GlassBackground
import com.expenso.app.ui.theme.NearBlack
import com.expenso.app.ui.theme.RoseRed
import com.expenso.app.ui.theme.White
import java.text.NumberFormat
import java.util.Locale

@Composable
fun SettlementConfirmationScreen(
    onNavigateBack: () -> Unit,
    viewModel: SettlementConfirmationViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val settlement = state.settlement
    val currency = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    Column(Modifier.fillMaxSize().background(GlassBackground).padding(top = 36.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onNavigateBack) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text("Settlement", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = NearBlack)
        }
        Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
            when {
                state.isLoading -> CircularProgressIndicator(color = DeepIndigo)
                settlement == null -> Text(state.error ?: "Settlement unavailable", color = RoseRed)
                else -> Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = White),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(currency.format(settlement.amount), fontSize = 32.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        Text("Status: ${settlement.status.replace('_', ' ')}")
                        settlement.transactionRef?.let {
                            Spacer(Modifier.height(4.dp))
                            Text("Reference: $it", fontSize = 13.sp)
                        }
                        state.error?.let {
                            Spacer(Modifier.height(12.dp))
                            Text(it, color = RoseRed)
                        }
                        if (state.canRespond) {
                            Spacer(Modifier.height(24.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedButton(
                                    onClick = viewModel::reject,
                                    enabled = !state.isSubmitting,
                                    modifier = Modifier.weight(1f)
                                ) { Text("Reject", color = RoseRed) }
                                Button(
                                    onClick = viewModel::confirm,
                                    enabled = !state.isSubmitting,
                                    colors = ButtonDefaults.buttonColors(containerColor = DeepIndigo),
                                    modifier = Modifier.weight(1f)
                                ) { Text("Confirm") }
                            }
                        }
                    }
                }
            }
        }
    }
}
