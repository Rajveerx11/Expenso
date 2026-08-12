package com.expenso.app.ui.screen.settlement

import androidx.lifecycle.SavedStateHandle
import com.expenso.app.domain.model.ExpenseSplit
import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.model.Settlement
import com.expenso.app.domain.model.User
import com.expenso.app.domain.model.validatedSettlementAmount
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import com.expenso.app.domain.repository.SettlementRepository
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
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettlementFlowTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `amount validation supports partial payment and blocks overpayment`() {
        assertEquals(4.25, validatedSettlementAmount("4.25", 10.0), 0.0)
        assertEquals(10.0, validatedSettlementAmount("10.004", 10.0), 0.0)
        assertThrows(IllegalArgumentException::class.java) {
            validatedSettlementAmount("10.01", 10.0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            validatedSettlementAmount("0", 10.0)
        }
    }

    @Test
    fun `repeated submit creates one pending settlement`() = runTest(dispatcher) {
        val settlementRepository = RecordingSettlementRepository()
        val viewModel = SettlementViewModel(
            SignedInAuthRepository(),
            BalanceGroupRepository(),
            settlementRepository,
            SavedStateHandle(mapOf("groupId" to "group", "receiverId" to "receiver"))
        )
        advanceUntilIdle()
        viewModel.updateAmount("4.25")

        viewModel.settle()
        viewModel.settle()
        advanceUntilIdle()

        assertEquals(1, settlementRepository.createCalls)
        assertEquals(4.25, settlementRepository.lastAmount, 0.0)
        assertTrue(viewModel.uiState.value.isSuccess)
    }

    @Test
    fun `expired session clears loading and exposes retryable error`() = runTest(dispatcher) {
        val viewModel = SettlementViewModel(
            SignedOutAuthRepository(),
            BalanceGroupRepository(),
            RecordingSettlementRepository(),
            SavedStateHandle(mapOf("groupId" to "group", "receiverId" to "receiver"))
        )
        advanceUntilIdle()
        assertEquals(false, viewModel.uiState.value.isLoading)
        assertTrue(viewModel.uiState.value.error!!.contains("Sign in again"))

        viewModel.updateAmount("1.00")
        viewModel.settle()
        advanceUntilIdle()
        assertEquals(false, viewModel.uiState.value.isLoading)
        assertTrue(viewModel.uiState.value.error!!.contains("Sign in again"))
    }
}

private class RecordingSettlementRepository : SettlementRepository {
    var createCalls = 0
    var lastAmount = 0.0
    override suspend fun createSettlement(groupId: String, payerId: String, receiverId: String, amount: Double, transactionRef: String?): Boolean {
        createCalls++
        lastAmount = amount
        delay(100)
        return true
    }
    override suspend fun getGroupSettlements(groupId: String): List<Settlement> = emptyList()
    override suspend fun confirmSettlement(settlementId: String, userId: String) = true
    override suspend fun rejectSettlement(settlementId: String, userId: String) = true
}

private class SignedInAuthRepository : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) =
        Result.success(com.expenso.app.domain.model.SignUpOutcome.AUTHENTICATED)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun signInWithGoogle(idToken: String, nonce: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = true
    override suspend fun needsOnboarding() = false
    override suspend fun completeOnboarding(fullName: String, upiId: String?) = Result.success(Unit)
    override suspend fun getCurrentUserId() = "payer"
    override suspend fun getCurrentUser(): User? = null
    override suspend fun signOut() = Result.success(Unit)
}

private class SignedOutAuthRepository : AuthRepository {
    override suspend fun signUp(email: String, password: String, fullName: String) =
        Result.success(com.expenso.app.domain.model.SignUpOutcome.AUTHENTICATED)
    override suspend fun signIn(email: String, password: String) = Result.success(Unit)
    override suspend fun signInWithGoogle(idToken: String, nonce: String) = Result.success(Unit)
    override suspend fun isLoggedIn() = false
    override suspend fun needsOnboarding() = false
    override suspend fun completeOnboarding(fullName: String, upiId: String?) = Result.success(Unit)
    override suspend fun getCurrentUserId(): String? = null
    override suspend fun getCurrentUser(): User? = null
    override suspend fun signOut() = Result.success(Unit)
}

private class BalanceGroupRepository : GroupRepository {
    override suspend fun getGroupBalances(groupId: String, userId: String) =
        listOf(GroupBalance("receiver", "Receiver", null, -10.0))
    override suspend fun getUserGroups(userId: String): List<Group> = emptyList()
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
    override suspend fun uploadGroupImage(groupId: String, imageBytes: ByteArray, extension: String): String? = null
}
