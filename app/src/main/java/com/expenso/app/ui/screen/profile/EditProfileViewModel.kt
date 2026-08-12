package com.expenso.app.ui.screen.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class EditProfileUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val isUploadingAvatar: Boolean = false,
    val saveSuccess: Boolean = false,
    val user: User? = null,
    val error: String? = null
)

@HiltViewModel
class EditProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(EditProfileUiState())
    val uiState: StateFlow<EditProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val user = authRepository.getCurrentUser()
                _uiState.update { it.copy(isLoading = false, user = user) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun uploadAvatar(imageBytes: ByteArray, extension: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUploadingAvatar = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId()
                if (userId != null) {
                    val avatarUrl = profileRepository.uploadAvatar(userId, imageBytes, extension)
                    if (avatarUrl != null) {
                        // Update profile with new avatar URL
                        val updatedUser = profileRepository.updateProfile(
                            userId = userId,
                            fullName = null,
                            avatarUrl = avatarUrl,
                            upiId = null
                        )
                        if (updatedUser != null) {
                            _uiState.update {
                                it.copy(isUploadingAvatar = false, user = updatedUser)
                            }
                        } else {
                            _uiState.update {
                                it.copy(isUploadingAvatar = false, error = "Failed to save avatar")
                            }
                        }
                    } else {
                        _uiState.update {
                            it.copy(isUploadingAvatar = false, error = "Failed to upload avatar")
                        }
                    }
                } else {
                    _uiState.update {
                        it.copy(isUploadingAvatar = false, error = "Sign in again to update your profile")
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isUploadingAvatar = false, error = e.message)
                }
            }
        }
    }

    fun saveProfile(fullName: String, upiId: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId()
                if (userId != null) {
                    val updatedUser = profileRepository.updateProfile(
                        userId = userId,
                        fullName = fullName,
                        avatarUrl = null,
                        upiId = upiId
                    )
                    if (updatedUser != null) {
                        _uiState.update {
                            it.copy(isSaving = false, saveSuccess = true, user = updatedUser)
                        }
                    } else {
                        _uiState.update {
                            it.copy(isSaving = false, error = "Failed to update profile")
                        }
                    }
                } else {
                    _uiState.update {
                        it.copy(isSaving = false, error = "Sign in again to update your profile")
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSaving = false, error = e.message) }
            }
        }
    }
}
