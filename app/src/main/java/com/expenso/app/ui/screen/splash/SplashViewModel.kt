package com.expenso.app.ui.screen.splash

import androidx.lifecycle.ViewModel
import com.expenso.app.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class SplashDestination { LOGIN, ONBOARDING, HOME }

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    suspend fun destination(): SplashDestination {
        if (!authRepository.isLoggedIn()) return SplashDestination.LOGIN
        return if (authRepository.needsOnboarding()) {
            SplashDestination.ONBOARDING
        } else {
            SplashDestination.HOME
        }
    }
}
