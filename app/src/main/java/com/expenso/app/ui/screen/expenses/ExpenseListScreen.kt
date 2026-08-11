package com.expenso.app.ui.screen.expenses

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.components.EmptyStateView
import com.expenso.app.ui.components.ExpenseCard
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.components.MonthYearPicker
import com.expenso.app.ui.theme.*
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.util.Locale

internal fun formatInr(amount: Double): String =
    "₹${String.format(Locale.ROOT, "%.2f", amount)}"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpenseListScreen(
    onNavigateToAddExpense: (String) -> Unit,
    onNavigateToEditExpense: (String) -> Unit,
    viewModel: ExpenseListViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedExpense by remember { mutableStateOf<com.expenso.app.domain.model.PersonalExpense?>(null) }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }
    
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.loadExpenses()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Color.Transparent,
        modifier = Modifier.background(
            brush = Brush.verticalGradient(
                colors = listOf(LightestIndigo, Color.White)
            )
        ),
        floatingActionButton = {
            FloatingActionButton(
                onClick = { onNavigateToAddExpense("expense") },
                containerColor = DeepIndigo,
                contentColor = Color.White
            ) {
                Icon(imageVector = Icons.Rounded.Add, contentDescription = "Add Expense")
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Month Picker
            MonthYearPicker(
                currentMonth = uiState.currentMonth,
                currentYear = uiState.currentYear,
                onMonthChanged = { month, year -> viewModel.changeMonth(month, year) }
            )
            
            // Summary Cards
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                GlassCard(modifier = Modifier.weight(1f)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Income",
                            style = MaterialTheme.typography.bodyMedium,
                            color = NeutralMedium
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = formatInr(uiState.monthlyIncome),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = EmeraldGreen
                        )
                    }
                }
                
                GlassCard(modifier = Modifier.weight(1f)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Expenses",
                            style = MaterialTheme.typography.bodyMedium,
                            color = NeutralMedium
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = formatInr(uiState.monthlyExpenses),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = RoseRed
                        )
                    }
                }
            }

            Text(
                text = "Month net ${formatInr(uiState.monthlyNet)}  ·  Lifetime net ${formatInr(uiState.lifetimeNet)}\n" +
                    "Lifetime · Income ${formatInr(uiState.lifetimeIncome)} · Expenses ${formatInr(uiState.lifetimeExpenses)}",
                style = MaterialTheme.typography.bodySmall,
                color = NeutralMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            if (uiState.categoryExpenses.isNotEmpty()) {
                Text(
                    text = uiState.categoryExpenses.entries.joinToString("  ·  ") {
                        "${it.key} ${formatInr(it.value)}"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = DeepIndigo,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }
            
            // Filters
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    label = "All",
                    selected = uiState.selectedFilter == "all",
                    onClick = { viewModel.setFilter("all") }
                )
                FilterChip(
                    label = "Income",
                    selected = uiState.selectedFilter == "income",
                    onClick = { viewModel.setFilter("income") }
                )
                FilterChip(
                    label = "Expense",
                    selected = uiState.selectedFilter == "expense",
                    onClick = { viewModel.setFilter("expense") }
                )
            }
            
            // Content
            if (uiState.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = DeepIndigo)
                }
            } else if (uiState.filteredExpenses.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    EmptyStateView(
                        icon = "🧾",
                        title = "No Transactions",
                        subtitle = "No transactions found for this month and filter."
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 80.dp)
                ) {
                    items(
                        items = uiState.filteredExpenses,
                        key = { it.id }
                    ) { expense ->
                        ExpenseCard(
                            expense = expense,
                            onClick = { selectedExpense = expense },
                            onDelete = { viewModel.deleteExpense(expense.id) },
                            modifier = Modifier.padding(bottom = 12.dp)
                        )
                    }
                }
            }
        }
        
    }

    selectedExpense?.let { expense ->
        AlertDialog(
            onDismissRequest = { selectedExpense = null },
            title = { Text(expense.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${if (expense.type == "income") "Income" else "Expense"} · ${expense.category}")
                    Text(formatInr(expense.amount), style = MaterialTheme.typography.headlineSmall)
                    Text(expense.expenseDate.substringBefore('T'))
                    expense.note?.takeIf { it.isNotBlank() }?.let { Text(it) }
                    if (expense.sourceGroupExpenseId != null) {
                        Text("Linked group transaction. Edit or delete it from the group.", color = NeutralMedium)
                    }
                }
            },
            confirmButton = {
                if (expense.sourceGroupExpenseId == null) {
                    TextButton(onClick = {
                        selectedExpense = null
                        onNavigateToEditExpense(expense.id)
                    }) { Text("Edit") }
                } else {
                    TextButton(onClick = { selectedExpense = null }) { Text("Close") }
                }
            },
            dismissButton = {
                if (expense.sourceGroupExpenseId == null) {
                    TextButton(onClick = { selectedExpense = null }) { Text("Close") }
                }
            }
        )
    }
}

@Composable
fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val backgroundColor by animateColorAsState(
        targetValue = if (selected) DeepIndigo else Color.Transparent,
        label = "chip_bg"
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) Color.White else NeutralMedium,
        label = "chip_text"
    )
    
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(backgroundColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = contentColor
        )
    }
}
