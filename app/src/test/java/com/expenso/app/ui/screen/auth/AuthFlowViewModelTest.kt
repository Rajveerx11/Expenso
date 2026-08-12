package com.expenso.app.ui.screen.auth

import com.expenso.app.core.auth.GoogleSignInNonce
import com.expenso.app.core.auth.GoogleSignInConfig
import com.expenso.app.core.auth.OnboardingValidator
import com.expenso.app.domain.model.User
import com.expenso.app.domain.model.SignUpOutcome
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ProfileRepository
import com.expenso.app.ui.screen.profile.ProfileViewModel
import com.expenso.app.ui.screen.splash.SplashDestination
import com.expenso.app.ui.screen.splash.SplashViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthFlowViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `google success routes a first run user to onboarding`() = runTest(dispatcher) {
        val repository = FakeAuthRepository(onboardingRequired = true)
        val viewModel = LoginViewModel(repository)

        viewModel.signInWithGoogle("id-token", "nonce")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.isSuccess)
        assertTrue(viewModel.uiState.value.needsOnboarding)
        assertEquals("id-token", repository.lastGoogleIdToken)
    }

    @Test
    fun `google failure remains on auth flow and exposes an error`() = runTest(dispatcher) {
        val repository = FakeAuthRepository(
            googleResult = Result.failure(IllegalStateException("provider disabled"))
        )
        val viewModel = LoginViewModel(repository)

        viewModel.signInWithGoogle("id-token", "nonce")
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isSuccess)
        assertEquals("provider disabled", viewModel.uiState.value.error)
    }

    @Test
    fun `splash keeps incomplete profiles in onboarding`() = runTest(dispatcher) {
        val repository = FakeAuthRepository(loggedIn = true, onboardingRequired = true)
        assertEquals(SplashDestination.ONBOARDING, SplashViewModel(repository).destination())

        repository.onboardingRequired = false
        assertEquals(SplashDestination.HOME, SplashViewModel(repository).destination())

        repository.loggedIn = false
        assertEquals(SplashDestination.LOGIN, SplashViewModel(repository).destination())
    }

    @Test
    fun `splash waits for persisted session initialization`() = runTest(dispatcher) {
        val loginGate = CompletableDeferred<Boolean>()
        val repository = FakeAuthRepository(
            loggedIn = false,
            onboardingRequired = false,
            loginGate = loginGate
        )

        val destination = async { SplashViewModel(repository).destination() }
        runCurrent()
        assertFalse(destination.isCompleted)

        loginGate.complete(true)
        assertEquals(SplashDestination.HOME, destination.await())
    }

    @Test
    fun `onboarding validation accepts optional upi and rejects malformed values`() {
        assertNull(OnboardingValidator.validate("Rajveer", ""))
        assertNull(OnboardingValidator.validate("Rajveer", "rajveer@bank"))
        assertEquals(
            "Enter a valid UPI ID, such as name@bank",
            OnboardingValidator.validate("Rajveer", "not-a-upi-id")
        )
    }

    @Test
    fun `nonce is url safe and unique`() {
        val first = GoogleSignInNonce.generate()
        val second = GoogleSignInNonce.generate()
        assertTrue(first.raw.matches(Regex("^[A-Za-z0-9_-]{43}$")))
        assertTrue(first.hashed.matches(Regex("^[a-f0-9]{64}$")))
        assertNotEquals(first.raw, second.raw)
        assertEquals(
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            GoogleSignInNonce.sha256("test")
        )
    }

    @Test
    fun `confirmation enabled signup stays unauthenticated`() = runTest(dispatcher) {
        val repository = FakeAuthRepository(
            signUpOutcome = SignUpOutcome.EMAIL_CONFIRMATION_REQUIRED
        )
        val viewModel = SignUpViewModel(repository)

        viewModel.signUp("Rajveer", "user@example.com", "password")
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isSuccess)
        assertTrue(viewModel.uiState.value.emailConfirmationRequired)
    }

    @Test
    fun `profile navigates only after successful signout`() = runTest(dispatcher) {
        val failingRepository = FakeAuthRepository(
            signOutResult = Result.failure(IllegalStateException("network error"))
        )
        val failingViewModel = ProfileViewModel(failingRepository, FakeProfileRepository())
        advanceUntilIdle()
        failingViewModel.signOut()
        advanceUntilIdle()
        assertFalse(failingViewModel.uiState.value.isSignedOut)
        assertEquals("network error", failingViewModel.uiState.value.error)

        val successViewModel = ProfileViewModel(FakeAuthRepository(), FakeProfileRepository())
        advanceUntilIdle()
        successViewModel.signOut()
        advanceUntilIdle()
        assertTrue(successViewModel.uiState.value.isSignedOut)
    }

    @Test
    fun `google client id validation rejects missing and malformed configuration`() {
        val valid = "123456789-example.apps.googleusercontent.com"
        assertEquals(valid, GoogleSignInConfig.validatedWebClientId("  $valid  "))

        listOf("", "YOUR_GOOGLE_WEB_CLIENT_ID_HERE", "android-client-id").forEach { value ->
            val error = runCatching { GoogleSignInConfig.validatedWebClientId(value) }.exceptionOrNull()
            assertTrue(error is IllegalArgumentException)
            assertEquals(
                "Google sign-in is unavailable in this build. Configure GOOGLE_WEB_CLIENT_ID.",
                error?.message
            )
        }
    }
}

private class FakeAuthRepository(
    var loggedIn: Boolean = true,
    var onboardingRequired: Boolean = false,
    private val googleResult: Result<Unit> = Result.success(Unit),
    private val signUpOutcome: SignUpOutcome = SignUpOutcome.AUTHENTICATED,
    private val signOutResult: Result<Unit> = Result.success(Unit),
    private val loginGate: CompletableDeferred<Boolean>? = null
) : AuthRepository {
    var lastGoogleIdToken: String? = null

    override suspend fun signUp(email: String, password: String, fullName: String) =
        Result.success(signUpOutcome)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun signInWithGoogle(idToken: String, nonce: String): Result<Unit> {
        lastGoogleIdToken = idToken
        return googleResult
    }
    override suspend fun isLoggedIn() = loginGate?.await() ?: loggedIn
    override suspend fun needsOnboarding() = onboardingRequired
    override suspend fun completeOnboarding(fullName: String, upiId: String?) = Result.success(Unit)
    override suspend fun getCurrentUserId(): String? = if (loggedIn) "user-id" else null
    override suspend fun getCurrentUser(): User? = null
    override suspend fun signOut(): Result<Unit> = signOutResult
}

private class FakeProfileRepository : ProfileRepository {
    override suspend fun getProfile(userId: String): User? = null
    override suspend fun updateProfile(
        userId: String,
        fullName: String?,
        avatarUrl: String?,
        upiId: String?
    ) = true
    override suspend fun uploadAvatar(userId: String, imageBytes: ByteArray, extension: String): String? = null
}
