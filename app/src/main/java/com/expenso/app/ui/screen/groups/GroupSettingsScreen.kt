package com.expenso.app.ui.screen.groups

import androidx.compose.foundation.layout.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.components.ConfirmationDialog
import com.expenso.app.ui.components.GlassCard
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.RoseRed
import com.expenso.app.ui.util.compressSelectedImage
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupSettingsScreen(
    viewModel: GroupSettingsViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onGroupDeleted: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            coroutineScope.launch {
                compressSelectedImage(context, it).fold(
                    onSuccess = viewModel::uploadImage,
                    onFailure = { error -> viewModel.setImageError(error.message ?: "Could not process image") }
                )
            }
        }
    }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onNavigateBack()
        }
    }

    LaunchedEffect(uiState.isDeleted) {
        if (uiState.isDeleted) {
            onGroupDeleted()
        }
    }

    if (showDeleteConfirm) {
        ConfirmationDialog(
            title = "Delete Group",
            message = "Only an empty group can be deleted. Groups with expenses or settlement history are retained for audit.",
            confirmText = "Delete",
            cancelText = "Cancel",
            onConfirm = {
                showDeleteConfirm = false
                viewModel.deleteGroup()
            },
            onDismiss = { showDeleteConfirm = false },
            isDestructive = true
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Group Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    OutlinedButton(
                        onClick = { imagePicker.launch("image/*") },
                        enabled = !uiState.isUploadingImage,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (uiState.isUploadingImage) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp))
                        } else {
                            Text(if (uiState.imageUrl == null) "Choose group image" else "Change group image")
                        }
                    }

                    OutlinedTextField(
                        value = uiState.name,
                        onValueChange = viewModel::updateName,
                        label = { Text("Group Name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = DeepIndigo,
                            focusedLabelColor = DeepIndigo
                        )
                    )

                    OutlinedTextField(
                        value = uiState.description,
                        onValueChange = viewModel::updateDescription,
                        label = { Text("Description") },
                        modifier = Modifier.fillMaxWidth().height(120.dp),
                        maxLines = 4,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = DeepIndigo,
                            focusedLabelColor = DeepIndigo
                        )
                    )
                }
            }

            Button(
                onClick = viewModel::saveSettings,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = !uiState.isLoading && !uiState.isUploadingImage,
                colors = ButtonDefaults.buttonColors(containerColor = DeepIndigo)
            ) {
                if (uiState.isLoading && !uiState.isDeleted) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                } else {
                    Text("Save Changes", fontWeight = FontWeight.Bold)
                }
            }

            uiState.error?.let { error ->
                Text(error, color = RoseRed, style = MaterialTheme.typography.bodyMedium)
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            OutlinedButton(
                onClick = { showDeleteConfirm = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = RoseRed)
            ) {
                Text("Delete Group", fontWeight = FontWeight.Bold)
            }
        }
    }
}
