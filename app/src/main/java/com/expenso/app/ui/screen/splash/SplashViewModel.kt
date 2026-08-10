package com.expenso.app.ui.screen.splash

import androidx.lifecycle.ViewModel
import com.expenso.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    suspend fun isLoggedIn(): Boolean {
        return authRepository.isLoggedIn()
    }
}
