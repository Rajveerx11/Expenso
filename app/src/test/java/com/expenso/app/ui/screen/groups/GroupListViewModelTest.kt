package com.expenso.app.ui.screen.groups

import com.expenso.app.domain.model.ExpenseSplit
import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
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
class GroupListViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `repository failure is shown instead of an empty successful list`() = runTest(dispatcher) {
        val viewModel = GroupListViewModel(GroupListAuthRepository(), FailingGroupRepository())

        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.groups.isEmpty())
        assertEquals("Could not load centralized groups", viewModel.uiState.value.error)
        assertFalse(viewModel.uiState.value.isLoading)
    }
}

private class GroupListAuthRepository : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) =
        Result.success(com.expenso.app.domain.model.SignUpOutcome.AUTHENTICATED)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun signInWithGoogle(idToken: String, nonce: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = true
    override suspend fun needsOnboarding() = false
    override suspend fun completeOnboarding(fullName: String, upiId: String?) = Result.success(Unit)
    override suspend fun getCurrentUserId() = "user"
    override suspend fun getCurrentUser(): User? = null
    override suspend fun signOut() = Result.success(Unit)
}

private class FailingGroupRepository : GroupRepository {
    override suspend fun getUserGroups(userId: String): List<Group> =
        error("Could not load centralized groups")
    override suspend fun getGroupById(groupId: String): Group? = null
    override suspend fun createGroup(name: String, description: String?): String? = null
    override suspend fun updateGroup(groupId: String, name: String, description: String?, imageUrl: String?) = true
    override suspend fun deleteGroup(groupId: String) = true
    override suspend fun getGroupMembers(groupId: String): List<GroupMember> = emptyList()
    override suspend fun addGroupMember(groupId: String, userEmail: String) = true
    override suspend fun removeGroupMember(groupId: String, userId: String) = true
    override suspend fun getGroupExpenses(groupId: String): List<GroupExpense> = emptyList()
    override suspend fun addGroupExpense(groupId: String, paidBy: String, title: String, totalAmount: Double, category: String, splitType: String, note: String?, expenseDate: String, splits: List<Pair<String, Double>>) = true
    override suspend fun deleteGroupExpense(expenseId: String) = true
    override suspend fun getExpenseSplits(expenseId: String): List<ExpenseSplit> = emptyList()
    override suspend fun getGroupBalances(groupId: String, userId: String): List<GroupBalance> = emptyList()
    override suspend fun uploadGroupImage(groupId: String, imageBytes: ByteArray, extension: String): String? = null
}
