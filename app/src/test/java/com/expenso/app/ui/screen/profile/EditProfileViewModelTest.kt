package com.expenso.app.ui.screen.profile

import com.expenso.app.domain.model.SignUpOutcome
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EditProfileViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `save publishes returned row and forwards blank UPI for clearing`() = runTest(dispatcher) {
        val repository = RecordingProfileRepository(updated = USER.copy(fullName = "New Name", upiId = null))
        val viewModel = EditProfileViewModel(SignedInAuthRepository(), repository)
        advanceUntilIdle()

        viewModel.saveProfile("New Name", "")
        advanceUntilIdle()

        assertEquals("", repository.lastUpiId)
        assertEquals("New Name", viewModel.uiState.value.user?.fullName)
        assertTrue(viewModel.uiState.value.saveSuccess)
    }

    @Test
    fun `zero row update stays on edit screen with error`() = runTest(dispatcher) {
        val viewModel = EditProfileViewModel(
            SignedInAuthRepository(), RecordingProfileRepository(updated = null)
        )
        advanceUntilIdle()

        viewModel.saveProfile("New Name", "name@bank")
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.saveSuccess)
        assertEquals("Failed to update profile", viewModel.uiState.value.error)
    }

    @Test
    fun `avatar URL is saved and returned profile replaces visible state`() = runTest(dispatcher) {
        val updated = USER.copy(avatarUrl = "https://example.test/avatar.jpg?v=1")
        val repository = RecordingProfileRepository(updated = updated, uploadedUrl = updated.avatarUrl)
        val viewModel = EditProfileViewModel(SignedInAuthRepository(), repository)
        advanceUntilIdle()

        viewModel.uploadAvatar(byteArrayOf(1, 2, 3), "jpg")
        advanceUntilIdle()

        assertEquals(updated.avatarUrl, repository.lastAvatarUrl)
        assertEquals(updated.avatarUrl, viewModel.uiState.value.user?.avatarUrl)
        assertFalse(viewModel.uiState.value.isUploadingAvatar)
    }

    @Test
    fun `expired session stops save and avatar loading states`() = runTest(dispatcher) {
        val repository = RecordingProfileRepository(updated = USER)
        val viewModel = EditProfileViewModel(SignedInAuthRepository(currentUserId = null), repository)
        advanceUntilIdle()

        viewModel.saveProfile("New Name", "")
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.isSaving)
        assertEquals("Sign in again to update your profile", viewModel.uiState.value.error)

        viewModel.uploadAvatar(byteArrayOf(1), "jpg")
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.isUploadingAvatar)
        assertEquals("Sign in again to update your profile", viewModel.uiState.value.error)
    }
}

private val USER = User("user", "user@example.test", "Old Name", upiId = "old@bank")

private class RecordingProfileRepository(
    private val updated: User?,
    private val uploadedUrl: String? = null
) : ProfileRepository {
    var lastUpiId: String? = null
    var lastAvatarUrl: String? = null

    override suspend fun getProfile(userId: String): User? = USER
    override suspend fun updateProfile(
        userId: String,
        fullName: String?,
        avatarUrl: String?,
        upiId: String?
    ): User? {
        lastUpiId = upiId
        lastAvatarUrl = avatarUrl
        return updated
    }
    override suspend fun uploadAvatar(userId: String, imageBytes: ByteArray, extension: String) = uploadedUrl
}

private class SignedInAuthRepository(private val currentUserId: String? = USER.id) : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) =
        Result.success(SignUpOutcome.AUTHENTICATED)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun signInWithGoogle(idToken: String, nonce: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = true
    override suspend fun needsOnboarding() = false
    override suspend fun completeOnboarding(fullName: String, upiId: String?) = Result.success(Unit)
    override suspend fun getCurrentUserId() = currentUserId
    override suspend fun getCurrentUser(): User = USER
    override suspend fun signOut() = Result.success(Unit)
}
