package com.expenso.app.ui.screen.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val needsOnboarding: Boolean = false,
    val emailConfirmationRequired: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Please enter both Email and Password") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = authRepository.signIn(email.trim(), password)
            result.fold(
                onSuccess = {
                    val needsOnboarding = authRepository.needsOnboarding()
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isSuccess = true,
                            needsOnboarding = needsOnboarding
                        )
                    }
                },
                onFailure = { throwable ->
                    _uiState.update {
                        it.copy(isLoading = false, error = throwable.localizedMessage ?: "Sign in failed")
                    }
                }
            )
        }
    }

    fun signInWithGoogle(idToken: String, nonce: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            authRepository.signInWithGoogle(idToken, nonce).fold(
                onSuccess = {
                    val needsOnboarding = authRepository.needsOnboarding()
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isSuccess = true,
                            needsOnboarding = needsOnboarding
                        )
                    }
                },
                onFailure = { throwable ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = throwable.localizedMessage ?: "Google sign-in failed"
                        )
                    }
                }
            )
        }
    }

    fun reportGoogleSignInError(message: String) {
        _uiState.update { it.copy(isLoading = false, error = message) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
