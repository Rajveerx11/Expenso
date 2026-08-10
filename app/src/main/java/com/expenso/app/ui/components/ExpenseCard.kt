package com.expenso.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.ui.theme.EmeraldGreen
import com.expenso.app.ui.theme.NeutralMedium
import com.expenso.app.ui.theme.RoseRed
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpenseCard(
    expense: PersonalExpense,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isIncome = expense.type == "income"
    // Subtle tinted background for income/expense
    val cardTint = if (isIncome) EmeraldGreen.copy(alpha = 0.06f) else RoseRed.copy(alpha = 0.06f)
    val accentColor = if (isIncome) EmeraldGreen else RoseRed
    
    val coroutineScope = rememberCoroutineScope()
    var showDeleteDialog by remember { mutableStateOf(false) }
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                showDeleteDialog = true
                false // DON'T dismiss - show dialog first
            } else {
                false
            }
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            val color by animateColorAsState(
                targetValue = if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) {
                    RoseRed
                } else {
                    RoseRed.copy(alpha = 0.5f)
                },
                label = "delete background color"
            )
            val scale by animateFloatAsState(
                targetValue = if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) 1.2f else 1f,
                label = "delete icon scale"
            )

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(vertical = 4.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(color)
                    .padding(end = 24.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    imageVector = Icons.Rounded.Delete,
                    contentDescription = "Delete",
                    tint = Color.White,
                    modifier = Modifier.scale(scale)
                )
            }
        },
        content = {
            Box(modifier = modifier.fillMaxWidth().clickable(onClick = onClick)) {
                GlassCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(cardTint)
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Category Emoji with accent-colored background
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(accentColor.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = getCategoryEmoji(expense.category), style = MaterialTheme.typography.headlineSmall)
                        }

                        Spacer(modifier = Modifier.width(16.dp))

                        // Title and Date
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = expense.title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = formatExpenseDate(expense.expenseDate),
                                style = MaterialTheme.typography.bodySmall,
                                color = NeutralMedium
                            )
                        }

                        Spacer(modifier = Modifier.width(8.dp))

                        // Amount with color
                        Text(
                            text = "${if (isIncome) "+" else "-"}\u20B9${"%.2f".format(expense.amount)}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = accentColor
                        )
                    }
                }
            }
        }
    )
    
    // Delete confirmation dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { 
                showDeleteDialog = false 
                coroutineScope.launch { dismissState.reset() }
            },
            title = { Text("Delete Transaction") },
            text = { Text("Are you sure you want to delete this transaction? This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        coroutineScope.launch { dismissState.reset() }
                        onDelete()
                    }
                ) {
                    Text("Delete", color = RoseRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showDeleteDialog = false 
                    coroutineScope.launch { dismissState.reset() }
                }) {
                    Text("Cancel", color = NeutralMedium)
                }
            }
        )
    }
}

private fun getCategoryEmoji(category: String): String {
    val map = mapOf(
        "Food" to "\uD83C\uDF55", "Transport" to "\uD83D\uDE97", "Shopping" to "\uD83D\uDED2",
        "Entertainment" to "\uD83C\uDFAC", "Bills" to "\uD83D\uDCA1", "Health" to "\uD83D\uDC8A",
        "Education" to "\uD83D\uDCDA", "Travel" to "\u2708\uFE0F", "Groceries" to "\uD83E\uDD66",
        "Rent" to "\uD83C\uDFE0", "Salary" to "\uD83D\uDCBC", "Freelance" to "\uD83D\uDCBB", "Other" to "\u2728"
    )
    return map[category] ?: "\u2728"
}

private fun formatExpenseDate(dateStr: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        inputFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = inputFormat.parse(dateStr.replace("Z", "").substringBefore("+"))
        val outputFormat = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())
        outputFormat.format(date!!)
    } catch (e: Exception) {
        dateStr.substringBefore("T")
    }
}
