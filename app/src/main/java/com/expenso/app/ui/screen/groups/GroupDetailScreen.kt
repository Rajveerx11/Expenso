package com.expenso.app.ui.screen.groups

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.ui.components.AvatarImage
import com.expenso.app.ui.components.ConfirmationDialog
import com.expenso.app.ui.components.EmptyStateView
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.theme.*
import java.text.NumberFormat
import java.util.Locale
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupDetailScreen(
    viewModel: GroupDetailViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToGroupSettings: (String) -> Unit,
    onNavigateToAddGroupExpense: (String) -> Unit,
    onNavigateToSettleUp: (String, String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val group = uiState.group
    val context = LocalContext.current
    val currencyFormat = remember { NumberFormat.getCurrencyInstance(Locale("en", "IN")) }
    
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    
    var showAddMemberDialog by remember { mutableStateOf(false) }
    var addMemberEmail by remember { mutableStateOf("") }
    var showConfirmAddDialog by remember { mutableStateOf(false) }
    var memberToRemove by remember { mutableStateOf<GroupMember?>(null) }

    // Clear success/error after showing
    LaunchedEffect(uiState.addMemberSuccess) {
        if (uiState.addMemberSuccess != null) {
            showAddMemberDialog = false
            addMemberEmail = ""
            kotlinx.coroutines.delay(2000)
            viewModel.clearAddMemberMessages()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(group?.name ?: "Group Details", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Share button
                    IconButton(onClick = {
                        val shareText = "Join my expense group \"${group?.name}\" on Expenso! Download the app and I'll add you."
                        val shareIntent = Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, shareText)
                        }, "Share Group")
                        context.startActivity(shareIntent)
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                    if (uiState.isAdmin) {
                        IconButton(onClick = { group?.id?.let { onNavigateToGroupSettings(it) } }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = GlassBackground
                )
            )
        },
        floatingActionButton = {
            if (uiState.selectedTab == 0) {
                FloatingActionButton(
                    onClick = { group?.id?.let { onNavigateToAddGroupExpense(it) } },
                    containerColor = DeepIndigo,
                    contentColor = Color.White
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add Expense")
                }
            }
        },
        containerColor = GlassBackground,
        snackbarHost = {
            // Show success message
            uiState.addMemberSuccess?.let { msg ->
                Snackbar(
                    modifier = Modifier.padding(16.dp),
                    containerColor = EmeraldGreen
                ) {
                    Text(msg, color = Color.White)
                }
            }
        }
    ) { paddingValues ->
        if (uiState.isLoading && group == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = DeepIndigo)
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                // Group info header
                if (group != null) {
                    GlassCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = group.name,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = NearBlack
                            )
                            if (!group.description.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = group.description,
                                    fontSize = 14.sp,
                                    color = MediumGrey
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "${uiState.members.size} member${if (uiState.members.size != 1) "s" else ""}",
                                fontSize = 13.sp,
                                color = DeepIndigo,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
                
                val tabs = listOf("Expenses", "Members", "Balances")
                TabRow(
                    selectedTabIndex = uiState.selectedTab,
                    containerColor = GlassBackground,
                    contentColor = DeepIndigo,
                    indicator = { tabPositions ->
                        TabRowDefaults.Indicator(
                            Modifier.tabIndicatorOffset(tabPositions[uiState.selectedTab]),
                            color = DeepIndigo
                        )
                    }
                ) {
                    tabs.forEachIndexed { index, title ->
                        Tab(
                            selected = uiState.selectedTab == index,
                            onClick = { viewModel.selectTab(index) },
                            text = { 
                                Text(
                                    text = title, 
                                    fontWeight = if (uiState.selectedTab == index) FontWeight.Bold else FontWeight.Normal,
                                    color = if (uiState.selectedTab == index) DeepIndigo else MediumGrey
                                ) 
                            }
                        )
                    }
                }

                when (uiState.selectedTab) {
                    0 -> ExpensesList(uiState.expenses, currencyFormat)
                    1 -> MembersList(
                        members = uiState.members,
                        isAdmin = uiState.isAdmin,
                        currentUserId = uiState.currentUserId,
                        onAddMember = { showAddMemberDialog = true },
                        onRemoveMember = { memberToRemove = it }
                    )
                    2 -> BalancesList(
                        balances = uiState.balances,
                        currentUserId = uiState.currentUserId,
                        currencyFormat = currencyFormat,
                        onSettleUp = { receiverId ->
                            group?.id?.let { onNavigateToSettleUp(it, receiverId) }
                        }
                    )
                }
            }
        }
    }
    
    // Add Member Dialog
    if (showAddMemberDialog) {
        AlertDialog(
            onDismissRequest = { 
                showAddMemberDialog = false
                addMemberEmail = ""
                viewModel.clearAddMemberMessages()
            },
            title = { Text("Add Member", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Enter the email address of the registered user you want to add:",
                        fontSize = 14.sp,
                        color = MediumGrey
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = addMemberEmail,
                        onValueChange = { addMemberEmail = it },
                        label = { Text("Email Address") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = DeepIndigo,
                            focusedLabelColor = DeepIndigo
                        )
                    )
                    uiState.addMemberError?.let { error ->
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(error, color = RoseRed, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (addMemberEmail.isNotBlank()) {
                            showConfirmAddDialog = true
                        }
                    },
                    enabled = !uiState.isAddingMember && addMemberEmail.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = DeepIndigo)
                ) {
                    if (uiState.isAddingMember) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                    } else {
                        Text("Add")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showAddMemberDialog = false
                    addMemberEmail = ""
                    viewModel.clearAddMemberMessages()
                }) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Confirm Add Member Dialog
    if (showConfirmAddDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmAddDialog = false },
            title = { Text("Confirm", fontWeight = FontWeight.Bold) },
            text = {
                Text("Are you sure you want to add \"$addMemberEmail\" to this group?")
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmAddDialog = false
                        viewModel.addMemberByEmail(addMemberEmail.trim())
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DeepIndigo)
                ) {
                    Text("Yes, Add")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmAddDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Remove Member Confirmation
    memberToRemove?.let { member ->
        AlertDialog(
            onDismissRequest = { memberToRemove = null },
            title = { Text("Remove Member", fontWeight = FontWeight.Bold) },
            text = {
                Text("Are you sure you want to remove ${member.userName} from this group? Their existing expenses will remain.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.removeMember(member.userId)
                        memberToRemove = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RoseRed)
                ) {
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { memberToRemove = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun ExpensesList(expenses: List<GroupExpense>, currencyFormat: NumberFormat) {
    if (expenses.isEmpty()) {
        EmptyStateView(
            icon = "🧾",
            title = "No Expenses Yet",
            subtitle = "Add an expense to start sharing costs."
        )
    } else {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(expenses) { expense ->
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(LightestIndigo),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = "🛒", fontSize = 22.sp)
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = expense.title, fontWeight = FontWeight.Bold, color = NearBlack)
                            Text(
                                text = "Paid by ${expense.paidByName.takeIf { it.isNotBlank() } ?: "Unknown"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MediumGrey
                            )
                            Text(
                                text = expense.expenseDate.take(10),
                                style = MaterialTheme.typography.bodySmall,
                                color = MediumGrey
                            )
                        }
                        Text(
                            text = currencyFormat.format(expense.totalAmount),
                            fontWeight = FontWeight.Bold,
                            color = DeepIndigo
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MembersList(
    members: List<GroupMember>,
    isAdmin: Boolean,
    currentUserId: String,
    onAddMember: () -> Unit,
    onRemoveMember: (GroupMember) -> Unit
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Add Member button
        if (isAdmin) {
            item {
                Card(
                    onClick = onAddMember,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = LightestIndigo)
                ) {
                    Row(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, tint = DeepIndigo)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add Member", color = DeepIndigo, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        
        items(members) { member ->
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AvatarImage(
                        imageUrl = member.userAvatarUrl,
                        name = member.userName.ifBlank { "U" },
                        size = 48.dp
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = member.userName.ifBlank { member.userEmail },
                                fontWeight = FontWeight.Bold,
                                color = NearBlack
                            )
                            if (member.userId == currentUserId) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("(You)", fontSize = 12.sp, color = DeepIndigo)
                            }
                        }
                        Text(
                            text = if (member.role == "admin") "Admin" else "Member",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (member.role == "admin") DeepIndigo else MediumGrey
                        )
                    }
                    if (isAdmin && member.userId != currentUserId) {
                        TextButton(onClick = { onRemoveMember(member) }) {
                            Text("Remove", color = RoseRed, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BalancesList(
    balances: List<GroupBalance>,
    currentUserId: String,
    currencyFormat: NumberFormat,
    onSettleUp: (String) -> Unit
) {
    if (balances.isEmpty()) {
        EmptyStateView(
            icon = "🎉",
            title = "All Settled Up!",
            subtitle = "No outstanding balances."
        )
    } else {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(balances) { balance ->
                val isPositive = balance.balance > 0
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AvatarImage(
                            imageUrl = balance.userAvatarUrl,
                            name = balance.userName,
                            size = 48.dp
                        )
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = balance.userName,
                                    fontWeight = FontWeight.Bold,
                                    color = NearBlack
                                )
                                if (balance.userId == currentUserId) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("(You)", fontSize = 12.sp, color = DeepIndigo)
                                }
                            }
                            Text(
                                text = if (isPositive) "is owed" else "owes",
                                style = MaterialTheme.typography.bodySmall,
                                color = MediumGrey
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = currencyFormat.format(kotlin.math.abs(balance.balance)),
                                fontWeight = FontWeight.Bold,
                                color = if (isPositive) EmeraldGreen else RoseRed
                            )
                            // Show "Settle Up" button if current user owes this person
                            if (!isPositive && balance.userId != currentUserId) {
                                Spacer(modifier = Modifier.height(4.dp))
                                TextButton(
                                    onClick = { onSettleUp(balance.userId) },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                ) {
                                    Text("Settle Up", fontSize = 12.sp, color = DeepIndigo)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
