package com.expenso.app.ui.screen.expenses

import androidx.compose.animation.*
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.components.CategoryPicker
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.theme.*
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddExpenseScreen(
    initialType: String = "expense",
    onNavigateBack: () -> Unit,
    viewModel: AddExpenseViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showCategoryPicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showSuccessOverlay by remember { mutableStateOf(false) }
    val successScale = remember { Animatable(0f) }

    LaunchedEffect(initialType) {
        if (uiState.type != initialType && (initialType == "income" || initialType == "expense")) {
            viewModel.updateType(initialType)
        }
    }

    // Success animation → navigate back
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            showSuccessOverlay = true
            successScale.animateTo(1f, animationSpec = spring(dampingRatio = 0.5f, stiffness = 300f))
            delay(800)
            onNavigateBack()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            when {
                                uiState.isLinkedGroupExpense -> "Group Transaction"
                                uiState.isEditing -> "Edit Transaction"
                                uiState.type == "income" -> "Add Income"
                                else -> "Add Expense"
                            }
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onNavigateBack) {
                            Icon(imageVector = Icons.Rounded.ArrowBack, contentDescription = "Back")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent
                    )
                )
            },
            containerColor = Color.Transparent,
            modifier = Modifier.background(
                brush = Brush.verticalGradient(
                    colors = listOf(LightestIndigo, Color.White)
                )
            )
        ) { paddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
                // Error Message
                if (uiState.error != null) {
                    Text(
                        text = uiState.error!!,
                        color = RoseRed,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }

                // Type Toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.White.copy(alpha = 0.5f)),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(24.dp))
                            .background(if (uiState.type == "expense") RoseRed else Color.Transparent)
                            .clickable(enabled = !uiState.isLinkedGroupExpense) { viewModel.updateType("expense") },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Expense",
                            color = if (uiState.type == "expense") Color.White else NeutralMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(24.dp))
                            .background(if (uiState.type == "income") EmeraldGreen else Color.Transparent)
                            .clickable(enabled = !uiState.isLinkedGroupExpense) { viewModel.updateType("income") },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Income",
                            color = if (uiState.type == "income") Color.White else NeutralMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))

                // Amount Input
                Text(
                    text = "Amount",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NeutralMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = uiState.amount,
                    onValueChange = { viewModel.updateAmount(it) },
                    prefix = { Text("₹", style = MaterialTheme.typography.headlineMedium) },
                    textStyle = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = if (uiState.type == "income") EmeraldGreen else RoseRed
                    ),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    enabled = !uiState.isLinkedGroupExpense,
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White.copy(alpha = 0.7f),
                        unfocusedContainerColor = Color.White.copy(alpha = 0.5f),
                        focusedBorderColor = if (uiState.type == "income") EmeraldGreen else RoseRed,
                        unfocusedBorderColor = Color.Transparent
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        // Title Input
                        OutlinedTextField(
                            value = uiState.title,
                            onValueChange = { viewModel.updateTitle(it) },
                            label = { Text("Title") },
                            singleLine = true,
                            enabled = !uiState.isLinkedGroupExpense,
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = Color.White.copy(alpha = 0.5f),
                                unfocusedContainerColor = Color.Transparent
                            )
                        )
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // Category Selection
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !uiState.isLinkedGroupExpense) { showCategoryPicker = true }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(DeepIndigo.copy(alpha = 0.1f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.Category, contentDescription = null, tint = DeepIndigo)
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column {
                                Text("Category", style = MaterialTheme.typography.bodySmall, color = NeutralMedium)
                                Text(uiState.category, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        
                        HorizontalDivider(color = NeutralLightest)
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        // Date Selection
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !uiState.isLinkedGroupExpense) { showDatePicker = true }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(Amber.copy(alpha = 0.1f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Rounded.DateRange, contentDescription = null, tint = Amber)
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column {
                                Text("Date", style = MaterialTheme.typography.bodySmall, color = NeutralMedium)
                                val displayDate = runCatching {
                                    LocalDate.parse(uiState.expenseDate.substringBefore('T'))
                                        .format(DateTimeFormatter.ofPattern("MMM dd, yyyy", Locale.getDefault()))
                                }.getOrDefault("Today")
                                Text(displayDate, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        
                        HorizontalDivider(color = NeutralLightest)
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        // Note Input
                        OutlinedTextField(
                            value = uiState.note,
                            onValueChange = { viewModel.updateNote(it) },
                            label = { Text("Note (Optional)") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(100.dp),
                            enabled = !uiState.isLinkedGroupExpense,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = Color.White.copy(alpha = 0.5f),
                                unfocusedContainerColor = Color.Transparent
                            )
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))
                
                Button(
                    onClick = { viewModel.saveExpense() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    enabled = !uiState.isLoading && !uiState.isSuccess && !uiState.isLinkedGroupExpense,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (uiState.type == "income") EmeraldGreen else DeepIndigo
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text(
                            text = when {
                                uiState.isLinkedGroupExpense -> "View only"
                                uiState.isEditing -> "Update"
                                else -> "Save"
                            },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Success checkmark overlay
        if (showSuccessOverlay) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .scale(successScale.value)
                        .size(100.dp)
                        .clip(CircleShape)
                        .background(
                            if (uiState.type == "income") EmeraldGreen else DeepIndigo
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = "Saved",
                        tint = Color.White,
                        modifier = Modifier.size(52.dp)
                    )
                }
            }
        }
    }
    
    if (showCategoryPicker && !uiState.isLinkedGroupExpense) {
        ModalBottomSheet(
            onDismissRequest = { showCategoryPicker = false },
            containerColor = GlassBackground
        ) {
            CategoryPicker(
                selectedCategory = uiState.category,
                onCategorySelected = { 
                    viewModel.updateCategory(it)
                    showCategoryPicker = false
                },
                onDismiss = { showCategoryPicker = false }
            )
        }
    }

    if (showDatePicker && !uiState.isLinkedGroupExpense) {
        val initialMillis = runCatching {
            LocalDate.parse(uiState.expenseDate.substringBefore('T'))
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        viewModel.updateDate(
                            Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
                        )
                    }
                    showDatePicker = false
                }) { Text("Select") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}
