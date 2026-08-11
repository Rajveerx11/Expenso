package com.expenso.app.ui.screen.groups

import androidx.lifecycle.SavedStateHandle
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AddGroupExpenseSubmissionTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `repeated save taps create one shared expense`() = runTest(dispatcher) {
        val repository = RecordingGroupRepository()
        val viewModel = AddGroupExpenseViewModel(
            repository,
            SharedExpenseAuthRepository(),
            SavedStateHandle(mapOf("groupId" to "group"))
        )
        advanceUntilIdle()
        viewModel.updateTitle("Dinner")
        viewModel.updateAmount("10.00")

        viewModel.saveExpense()
        viewModel.saveExpense()
        advanceUntilIdle()

        assertEquals(1, repository.addCalls)
        assertTrue(viewModel.uiState.value.isSuccess)
    }
}

private class SharedExpenseAuthRepository : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) = Result.success(Unit)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = true
    override suspend fun getCurrentUserId() = "payer"
    override suspend fun getCurrentUser() = User("payer", "payer@test.local", "Payer")
    override suspend fun signOut() = Unit
}

private class RecordingGroupRepository : GroupRepository {
    var addCalls = 0
    override suspend fun getGroupMembers(groupId: String) = listOf(
        GroupMember("member", groupId, "payer", "admin", "", "Payer")
    )
    override suspend fun addGroupExpense(groupId: String, paidBy: String, title: String, totalAmount: Double, category: String, splitType: String, note: String?, expenseDate: String, splits: List<Pair<String, Double>>): Boolean {
        addCalls++
        delay(100)
        return true
    }
    override suspend fun getUserGroups(userId: String): List<Group> = emptyList()
    override suspend fun getGroupById(groupId: String): Group? = null
    override suspend fun createGroup(name: String, description: String?, createdBy: String): String? = null
    override suspend fun updateGroup(groupId: String, name: String, description: String?, imageUrl: String?) = true
    override suspend fun deleteGroup(groupId: String) = true
    override suspend fun addGroupMember(groupId: String, userEmail: String) = true
    override suspend fun removeGroupMember(groupId: String, userId: String) = true
    override suspend fun getGroupExpenses(groupId: String): List<GroupExpense> = emptyList()
    override suspend fun deleteGroupExpense(expenseId: String) = false
    override suspend fun getExpenseSplits(expenseId: String): List<ExpenseSplit> = emptyList()
    override suspend fun getGroupBalances(groupId: String, userId: String): List<GroupBalance> = emptyList()
    override suspend fun uploadGroupImage(groupId: String, imageBytes: ByteArray, extension: String): String? = null
}
