package com.expenso.app.ui.screen.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.core.auth.OnboardingValidator
import com.expenso.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class OnboardingUiState(
    val suggestedName: String = "",
    val suggestedUpiId: String = "",
    val isLoading: Boolean = true,
    val isComplete: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser()
            _uiState.update {
                it.copy(
                    suggestedName = user?.fullName.orEmpty(),
                    suggestedUpiId = user?.upiId.orEmpty(),
                    isLoading = false
                )
            }
        }
    }

    fun complete(fullName: String, upiId: String) {
        OnboardingValidator.validate(fullName, upiId).also { validationError ->
            if (validationError != null) {
                _uiState.update { it.copy(error = validationError) }
                return
            }
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            authRepository.completeOnboarding(fullName, upiId.ifBlank { null }).fold(
                onSuccess = {
                    _uiState.update { it.copy(isLoading = false, isComplete = true) }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.localizedMessage ?: "Could not save your profile"
                        )
                    }
                }
            )
        }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
