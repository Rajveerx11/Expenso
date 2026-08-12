package com.expenso.app.ui.screen.profile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.expenso.app.ui.components.AvatarImage
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.GlassBackground
import com.expenso.app.ui.theme.NeutralLight
import com.expenso.app.ui.theme.NeutralMedium
import com.expenso.app.ui.theme.White
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(
    onNavigateBack: () -> Unit,
    viewModel: EditProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    var fullName by remember(uiState.user) {
        mutableStateOf(uiState.user?.fullName ?: "")
    }
    var upiId by remember(uiState.user) {
        mutableStateOf(uiState.user?.upiId ?: "")
    }

    // Image picker launcher
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            try {
                val inputStream = context.contentResolver.openInputStream(it)
                val originalBitmap = BitmapFactory.decodeStream(inputStream)
                inputStream?.close()
                
                if (originalBitmap != null) {
                    // Resize to max 512x512 for efficiency
                    val maxSize = 512
                    val ratio = minOf(
                        maxSize.toFloat() / originalBitmap.width,
                        maxSize.toFloat() / originalBitmap.height,
                        1f
                    )
                    val width = (originalBitmap.width * ratio).toInt()
                    val height = (originalBitmap.height * ratio).toInt()
                    val resized = Bitmap.createScaledBitmap(originalBitmap, width, height, true)
                    
                    // Compress to JPEG
                    val baos = ByteArrayOutputStream()
                    resized.compress(Bitmap.CompressFormat.JPEG, 80, baos)
                    val imageBytes = baos.toByteArray()
                    
                    viewModel.uploadAvatar(imageBytes, "jpg")
                    
                    if (resized != originalBitmap) resized.recycle()
                    originalBitmap.recycle()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    LaunchedEffect(uiState.saveSuccess) {
        if (uiState.saveSuccess) {
            snackbarHostState.showSnackbar("Profile updated successfully!")
            onNavigateBack()
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(GlassBackground)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            TopAppBar(
                title = {
                    Text(
                        "Edit Profile",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 18.sp
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = GlassBackground
                )
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(16.dp))

                // Avatar with camera button
                Box(contentAlignment = Alignment.BottomEnd) {
                    if (uiState.isUploadingAvatar) {
                        Box(
                            modifier = Modifier.size(100.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(40.dp),
                                color = DeepIndigo,
                                strokeWidth = 3.dp
                            )
                        }
                    } else {
                        AvatarImage(
                            imageUrl = uiState.user?.avatarUrl,
                            name = uiState.user?.fullName ?: "User",
                            size = 100.dp
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(DeepIndigo, RoundedCornerShape(50))
                            .clickable { imagePickerLauncher.launch("image/*") },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Rounded.CameraAlt,
                            contentDescription = "Change photo",
                            tint = White,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it },
                    label = { Text("Full Name") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = DeepIndigo,
                        unfocusedBorderColor = NeutralLight,
                        focusedLabelColor = DeepIndigo
                    ),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = uiState.user?.email ?: "",
                    onValueChange = {},
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    enabled = false,
                    colors = OutlinedTextFieldDefaults.colors(
                        disabledBorderColor = NeutralLight,
                        disabledTextColor = NeutralMedium,
                        disabledLabelColor = NeutralMedium
                    ),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = upiId,
                    onValueChange = { upiId = it },
                    label = { Text("UPI ID") },
                    placeholder = { Text("yourname@okicici", color = NeutralMedium) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = DeepIndigo,
                        unfocusedBorderColor = NeutralLight,
                        focusedLabelColor = DeepIndigo
                    ),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Required for receiving payments from group members",
                    fontSize = 12.sp,
                    color = NeutralMedium,
                    modifier = Modifier.padding(start = 4.dp)
                )

                Spacer(modifier = Modifier.height(32.dp))

                Button(
                    onClick = {
                        viewModel.saveProfile(
                            fullName = fullName.trim(),
                            upiId = upiId.trim()
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DeepIndigo
                    ),
                    enabled = !uiState.isSaving && fullName.isNotBlank()
                ) {
                    if (uiState.isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "Save Changes",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 15.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
        )
    }
}
