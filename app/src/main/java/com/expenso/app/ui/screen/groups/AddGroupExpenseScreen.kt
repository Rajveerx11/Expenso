package com.expenso.app.ui.screen.groups

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.ui.components.AvatarImage
import com.expenso.app.ui.components.CategoryPicker
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.theme.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddGroupExpenseScreen(
    onNavigateBack: () -> Unit,
    viewModel: AddGroupExpenseViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showCategoryPicker by remember { mutableStateOf(false) }
    var showPayerSheet by remember { mutableStateOf(false) }

    // Success overlay
    if (uiState.isSuccess) {
        LaunchedEffect(Unit) {
            delay(1500)
            onNavigateBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add Group Expense", color = NearBlack) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = NearBlack)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = GlassBackground)
            )
        },
        containerColor = GlassBackground
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Amount & Title Section
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        OutlinedTextField(
                            value = uiState.totalAmount,
                            onValueChange = viewModel::updateAmount,
                            label = { Text("Amount (₹)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = DeepIndigo,
                                cursorColor = DeepIndigo
                            ),
                            textStyle = MaterialTheme.typography.headlineMedium
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedTextField(
                            value = uiState.title,
                            onValueChange = viewModel::updateTitle,
                            label = { Text("Expense Title (e.g., Dinner)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = DeepIndigo,
                                cursorColor = DeepIndigo
                            )
                        )
                    }
                }

                // Category & Date Section
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    GlassCard(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { showCategoryPicker = true }
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            Text("Category", style = MaterialTheme.typography.labelMedium, color = NeutralMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(uiState.category, style = MaterialTheme.typography.titleMedium, color = DeepIndigo)
                        }
                    }

                    GlassCard(modifier = Modifier.weight(1f)) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            Text("Date", style = MaterialTheme.typography.labelMedium, color = NeutralMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(uiState.expenseDate, style = MaterialTheme.typography.titleMedium, color = DeepIndigo)
                        }
                    }
                }

                // Paid By Section
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showPayerSheet = true }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Paid by", style = MaterialTheme.typography.labelMedium, color = NeutralMedium)
                            Text(uiState.paidByName, style = MaterialTheme.typography.titleMedium, color = DeepIndigo)
                        }
                        Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Select Payer", tint = DeepIndigo)
                    }
                }

                // Split Among Section
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        val selectedCount = uiState.selectedMembersForSplit.values.count { it }
                        Text(
                            "Split between ($selectedCount of ${uiState.members.size} members)",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = NearBlack
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        TabRow(
                            selectedTabIndex = when(uiState.splitType) {
                                "equal" -> 0
                                "exact" -> 1
                                "percentage" -> 2
                                else -> 0
                            },
                            containerColor = Color.Transparent,
                            contentColor = DeepIndigo
                        ) {
                            Tab(selected = uiState.splitType == "equal", onClick = { viewModel.setSplitType("equal") }) {
                                Text("Equal", modifier = Modifier.padding(12.dp))
                            }
                            Tab(selected = uiState.splitType == "exact", onClick = { viewModel.setSplitType("exact") }) {
                                Text("Exact", modifier = Modifier.padding(12.dp))
                            }
                            Tab(selected = uiState.splitType == "percentage", onClick = { viewModel.setSplitType("percentage") }) {
                                Text("Percentage", modifier = Modifier.padding(12.dp))
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        val totalAmt = uiState.totalAmount.toDoubleOrNull() ?: 0.0

                        when(uiState.splitType) {
                            "equal" -> {
                                val splitAmt = if (selectedCount > 0) totalAmt / selectedCount else 0.0
                                uiState.members.forEach { member ->
                                    val isSelected = uiState.selectedMembersForSplit[member.userId] == true
                                    MemberEqualRow(
                                        member = member,
                                        isSelected = isSelected,
                                        amount = if (isSelected) splitAmt else 0.0,
                                        onToggle = { viewModel.toggleMemberSelection(member.userId) }
                                    )
                                }
                            }
                            "exact" -> {
                                var currentSum = 0.0
                                uiState.members.forEach { member ->
                                    val amt = uiState.exactAmounts[member.userId]?.toDoubleOrNull() ?: 0.0
                                    currentSum += amt
                                    MemberInputRow(
                                        member = member,
                                        value = uiState.exactAmounts[member.userId] ?: "",
                                        label = "₹",
                                        onValueChange = { viewModel.updateExactAmount(member.userId, it) }
                                    )
                                }
                                val remaining = totalAmt - currentSum
                                val color = if (remaining < 0) RoseRed else NeutralMedium
                                Text(
                                    "₹${String.format("%.2f", currentSum)} of ₹${String.format("%.2f", totalAmt)} (₹${String.format("%.2f", remaining)} remaining)",
                                    color = color,
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
                                    textAlign = TextAlign.Center
                                )
                            }
                            "percentage" -> {
                                var currentPct = 0.0
                                uiState.members.forEach { member ->
                                    val pct = uiState.percentages[member.userId]?.toDoubleOrNull() ?: 0.0
                                    currentPct += pct
                                    MemberInputRow(
                                        member = member,
                                        value = uiState.percentages[member.userId] ?: "",
                                        label = "%",
                                        onValueChange = { viewModel.updatePercentage(member.userId, it) }
                                    )
                                }
                                val remainingPct = 100.0 - currentPct
                                val color = if (remainingPct < 0) RoseRed else NeutralMedium
                                Text(
                                    "${String.format("%.1f", currentPct)}% of 100% (${String.format("%.1f", remainingPct)}% remaining)",
                                    color = color,
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    }
                }

                // Notes
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = uiState.note,
                        onValueChange = viewModel::updateNote,
                        label = { Text("Notes (Optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = DeepIndigo,
                            cursorColor = DeepIndigo
                        ),
                        minLines = 2
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = viewModel::saveExpense,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldGreen)
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text("Save Expense", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))
            }
            
            // Error Snackbar equivalent (simplified as text or you could use a SnackbarHost)
            uiState.error?.let { err ->
                Snackbar(
                    modifier = Modifier.padding(16.dp).align(Alignment.BottomCenter),
                    containerColor = RoseRed,
                    action = {
                        TextButton(onClick = viewModel::dismissError) {
                            Text("OK", color = Color.White)
                        }
                    }
                ) {
                    Text(err, color = Color.White)
                }
            }
            
            // Success Overlay
            AnimatedVisibility(
                visible = uiState.isSuccess,
                enter = fadeIn(tween(300)),
                exit = fadeOut(tween(300)),
                modifier = Modifier.fillMaxSize()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center
                ) {
                    AnimatedVisibility(
                        visible = uiState.isSuccess,
                        enter = scaleIn(tween(500, delayMillis = 100)),
                        exit = scaleOut(tween(300))
                    ) {
                        Box(
                            modifier = Modifier
                                .size(120.dp)
                                .clip(CircleShape)
                                .background(EmeraldGreen),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Success",
                                tint = Color.White,
                                modifier = Modifier.size(64.dp)
                            )
                        }
                    }
                }
            }
        }
    }

    if (showCategoryPicker) {
        CategoryPicker(
            selectedCategory = uiState.category,
            onCategorySelected = viewModel::updateCategory,
            onDismiss = { showCategoryPicker = false }
        )
    }

    if (showPayerSheet) {
        Dialog(
            onDismissRequest = { showPayerSheet = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable(onClick = { showPayerSheet = false })
                )
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    cornerRadius = 24.dp
                ) {
                    Column {
                        Text("Who paid?", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = DeepIndigo)
                        Spacer(modifier = Modifier.height(16.dp))
                        LazyColumn {
                            items(uiState.members) { member ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            viewModel.setPaidBy(member.userId, member.userName)
                                            showPayerSheet = false
                                        }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    AvatarImage(
                                        imageUrl = member.userAvatarUrl,
                                        name = member.userName,
                                        size = 40.dp
                                    )
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Text(member.userName, style = MaterialTheme.typography.bodyLarge, color = NearBlack, modifier = Modifier.weight(1f))
                                    if (uiState.paidByUserId == member.userId) {
                                        Icon(Icons.Default.Check, contentDescription = "Selected", tint = EmeraldGreen)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MemberEqualRow(member: GroupMember, isSelected: Boolean, amount: Double, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = isSelected, onCheckedChange = { onToggle() }, colors = CheckboxDefaults.colors(checkedColor = DeepIndigo))
            Spacer(modifier = Modifier.width(8.dp))
            AvatarImage(imageUrl = member.userAvatarUrl, name = member.userName, size = 32.dp)
            Spacer(modifier = Modifier.width(12.dp))
            Text(member.userName, style = MaterialTheme.typography.bodyLarge, color = NearBlack)
        }
        if (isSelected) {
            Text("₹${String.format("%.2f", amount)}", style = MaterialTheme.typography.titleMedium, color = DeepIndigo, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun MemberInputRow(member: GroupMember, value: String, label: String, onValueChange: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            AvatarImage(imageUrl = member.userAvatarUrl, name = member.userName, size = 32.dp)
            Spacer(modifier = Modifier.width(12.dp))
            Text(member.userName, style = MaterialTheme.typography.bodyLarge, color = NearBlack)
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.width(100.dp),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = DeepIndigo, cursorColor = DeepIndigo)
        )
    }
}
