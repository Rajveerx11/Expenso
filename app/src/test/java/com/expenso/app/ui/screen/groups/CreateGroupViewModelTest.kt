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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CreateGroupViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `retry resumes enrichment without creating a duplicate group`() = runTest(dispatcher) {
        val repository = RetryGroupRepository()
        val viewModel = CreateGroupViewModel(SignedInAuthRepository(), repository)
        viewModel.updateName("Trip")
        viewModel.addPendingMember("a@example.com")
        viewModel.addPendingMember("b@example.com")

        viewModel.createGroup()
        advanceUntilIdle()

        assertEquals(1, repository.createCalls)
        assertEquals("group-id", viewModel.uiState.value.createdGroupId)
        assertEquals(setOf("a@example.com"), viewModel.uiState.value.addedMemberEmails)
        assertTrue(viewModel.uiState.value.error!!.startsWith("Group created. Retry"))

        viewModel.createGroup()
        advanceUntilIdle()

        assertEquals(1, repository.createCalls)
        assertEquals(1, repository.addAttempts.count { it == "a@example.com" })
        assertEquals(2, repository.addAttempts.count { it == "b@example.com" })
        assertTrue(viewModel.uiState.value.isSuccess)
    }
}

private class SignedInAuthRepository : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) = Result.success(Unit)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = true
    override suspend fun getCurrentUserId() = "user"
    override suspend fun getCurrentUser(): User? = null
    override suspend fun signOut() = Unit
}

private class RetryGroupRepository : GroupRepository {
    var createCalls = 0
    val addAttempts = mutableListOf<String>()
    private var failedOnce = false

    override suspend fun createGroup(name: String, description: String?): String {
        createCalls++
        return "group-id"
    }

    override suspend fun updateGroup(groupId: String, name: String, description: String?, imageUrl: String?) = true

    override suspend fun addGroupMember(groupId: String, userEmail: String): Boolean {
        addAttempts += userEmail
        if (userEmail == "b@example.com" && !failedOnce) {
            failedOnce = true
            error("temporary failure")
        }
        return true
    }

    override suspend fun getUserGroups(userId: String): List<Group> = emptyList()
    override suspend fun getGroupById(groupId: String): Group? = null
    override suspend fun deleteGroup(groupId: String) = true
    override suspend fun getGroupMembers(groupId: String): List<GroupMember> = emptyList()
    override suspend fun removeGroupMember(groupId: String, userId: String) = true
    override suspend fun getGroupExpenses(groupId: String): List<GroupExpense> = emptyList()
    override suspend fun addGroupExpense(groupId: String, paidBy: String, title: String, totalAmount: Double, category: String, splitType: String, note: String?, expenseDate: String, splits: List<Pair<String, Double>>) = true
    override suspend fun deleteGroupExpense(expenseId: String) = true
    override suspend fun getExpenseSplits(expenseId: String): List<ExpenseSplit> = emptyList()
    override suspend fun getGroupBalances(groupId: String, userId: String): List<GroupBalance> = emptyList()
    override suspend fun uploadGroupImage(groupId: String, imageBytes: ByteArray, extension: String): String? = null
}
