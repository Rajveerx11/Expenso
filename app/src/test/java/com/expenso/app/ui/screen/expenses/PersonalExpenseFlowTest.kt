package com.expenso.app.ui.screen.expenses

import androidx.lifecycle.SavedStateHandle
import com.expenso.app.domain.model.ExpenseAnalytics
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ExpenseRepository
import com.expenso.app.data.repository.monthBounds
import com.expenso.app.data.repository.filterExpensesForMonth
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PersonalExpenseFlowTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `analytics calculates income expenses net and descending categories`() {
        val analytics = ExpenseAnalytics.from(
            listOf(
                expense("salary", 5000.55, "Salary", "income"),
                expense("rent", 2000.10, "Rent"),
                expense("food", 750.20, "Food"),
                expense("food2", 250.30, "Food")
            )
        )

        assertEquals(5000.55, analytics.income, 0.001)
        assertEquals(3000.60, analytics.expenses, 0.001)
        assertEquals(1999.95, analytics.net, 0.001)
        assertEquals(listOf("Rent", "Food"), analytics.categoryExpenses.keys.toList())
        assertEquals("₹1234.56", formatInr(1234.56))
    }

    @Test
    fun `new transactions use a Postgres date and preserve income type`() = runTest(dispatcher) {
        val repository = FakeExpenseRepository()
        val viewModel = AddExpenseViewModel(SavedStateHandle(), FakeAuthRepository(), repository)
        assertTrue(viewModel.uiState.value.expenseDate.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$")))
        assertFalse(viewModel.uiState.value.expenseDate.contains('T'))

        viewModel.updateType("income")
        viewModel.updateTitle("Salary")
        viewModel.updateAmount("5000")
        viewModel.saveExpense()
        advanceUntilIdle()

        assertEquals("income", repository.savedType)
        assertTrue(viewModel.uiState.value.isSuccess)
    }

    @Test
    fun `linked group transaction cannot be edited from personal feed`() = runTest(dispatcher) {
        val linked = expense("linked", 100.0, "Food").copy(sourceGroupExpenseId = "group-expense")
        val repository = FakeExpenseRepository(linked)
        val viewModel = AddExpenseViewModel(
            SavedStateHandle(mapOf("expenseId" to "linked")),
            FakeAuthRepository(),
            repository
        )
        advanceUntilIdle()
        viewModel.saveExpense()

        assertEquals("Group transactions must be edited from the group", viewModel.uiState.value.error)
        assertFalse(repository.updated)
    }

    @Test
    fun `editing updates an ordinary transaction and reports a failed update`() = runTest(dispatcher) {
        val existing = expense("edit", 10.25, "Food")
        val successRepository = FakeExpenseRepository(existing = existing)
        val successViewModel = AddExpenseViewModel(
            SavedStateHandle(mapOf("expenseId" to "edit")), FakeAuthRepository(), successRepository
        )
        advanceUntilIdle()
        successViewModel.updateAmount("12.75")
        successViewModel.saveExpense()
        advanceUntilIdle()
        assertTrue(successRepository.updated)
        assertTrue(successViewModel.uiState.value.isSuccess)

        val failedRepository = FakeExpenseRepository(existing = existing, updateResult = false)
        val failedViewModel = AddExpenseViewModel(
            SavedStateHandle(mapOf("expenseId" to "edit")), FakeAuthRepository(), failedRepository
        )
        advanceUntilIdle()
        failedViewModel.saveExpense()
        advanceUntilIdle()
        assertEquals("Failed to save transaction", failedViewModel.uiState.value.error)
    }

    @Test
    fun `filters monthly rows and exposes decimal net totals`() = runTest(dispatcher) {
        val rows = listOf(
            expense("income", 100.75, "Salary", "income"),
            expense("expense", 40.25, "Food")
        )
        val viewModel = ExpenseListViewModel(FakeAuthRepository(), FakeExpenseRepository(monthRows = rows))
        advanceUntilIdle()
        assertEquals(60.50, viewModel.uiState.value.monthlyNet, 0.001)
        viewModel.setFilter("income")
        assertEquals(listOf("income"), viewModel.uiState.value.filteredExpenses.map { it.id })
        viewModel.setFilter("expense")
        assertEquals(listOf("expense"), viewModel.uiState.value.filteredExpenses.map { it.id })
    }

    @Test
    fun `month bounds cross year using ASCII Postgres dates`() {
        assertEquals("2026-01-01" to "2026-02-01", monthBounds(2026, 0))
        assertEquals("2026-12-01" to "2027-01-01", monthBounds(2026, 11))
    }

    @Test
    fun `August rows exclude July and September boundaries`() {
        val rows = listOf(
            expense("july-end", 10.0, "Food").copy(expenseDate = "2026-07-31"),
            expense("august-start", 20.0, "Food").copy(expenseDate = "2026-08-01"),
            expense("august-end", 30.0, "Food").copy(expenseDate = "2026-08-31"),
            expense("september-start", 40.0, "Food").copy(expenseDate = "2026-09-01")
        )

        assertEquals(
            listOf("august-start", "august-end"),
            filterExpensesForMonth(rows, 2026, 7).map { it.id }
        )
        assertEquals(
            listOf("july-end"),
            filterExpensesForMonth(rows, 2026, 6).map { it.id }
        )
    }

    @Test
    fun `month filtering accepts timestamp-shaped legacy dates without shifting timezone`() {
        val rows = listOf(
            expense("july", 10.0, "Food").copy(expenseDate = "2026-07-31T23:59:59Z"),
            expense("august", 20.0, "Food").copy(expenseDate = "2026-08-01T00:00:00Z")
        )

        assertEquals(
            listOf("august"),
            filterExpensesForMonth(rows, 2026, 7).map { it.id }
        )
    }

    @Test
    fun `latest month wins when an older load is still pending`() = runTest(dispatcher) {
        val repository = FakeExpenseRepository(
            rowsByMonth = mapOf(
                0 to listOf(expense("january", 10.0, "Food")),
                1 to listOf(expense("february", 20.0, "Food"))
            ),
            delaysByMonth = mapOf(0 to 1_000L, 1 to 10L)
        )
        val viewModel = ExpenseListViewModel(FakeAuthRepository(), repository)
        viewModel.changeMonth(0, 2026)
        viewModel.changeMonth(1, 2026)
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.currentMonth)
        assertEquals(listOf("february"), viewModel.uiState.value.expenses.map { it.id })
        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun `changing from July to August replaces rows and totals`() = runTest(dispatcher) {
        val repository = FakeExpenseRepository(
            rowsByMonth = mapOf(
                6 to listOf(expense("july-31", 31.0, "Food").copy(expenseDate = "2026-07-31")),
                7 to listOf(expense("august-1", 1.0, "Food").copy(expenseDate = "2026-08-01"))
            )
        )
        val viewModel = ExpenseListViewModel(FakeAuthRepository(), repository)

        viewModel.changeMonth(6, 2026)
        advanceUntilIdle()
        assertEquals(listOf("july-31"), viewModel.uiState.value.expenses.map { it.id })
        assertEquals(31.0, viewModel.uiState.value.monthlyExpenses, 0.001)

        viewModel.changeMonth(7, 2026)
        advanceUntilIdle()
        assertEquals(listOf("august-1"), viewModel.uiState.value.expenses.map { it.id })
        assertEquals(1.0, viewModel.uiState.value.monthlyExpenses, 0.001)
    }

    @Test
    fun `filter changed during load is applied to the arriving rows`() = runTest(dispatcher) {
        val rows = listOf(
            expense("income", 30.0, "Salary", "income"),
            expense("expense", 10.0, "Food")
        )
        val repository = FakeExpenseRepository(monthRows = rows, defaultDelay = 100L)
        val viewModel = ExpenseListViewModel(FakeAuthRepository(), repository)
        viewModel.setFilter("income")
        advanceUntilIdle()
        assertEquals("income", viewModel.uiState.value.selectedFilter)
        assertEquals(listOf("income"), viewModel.uiState.value.filteredExpenses.map { it.id })
    }

    @Test
    fun `load errors are visible and do not publish rows`() = runTest(dispatcher) {
        val viewModel = ExpenseListViewModel(
            FakeAuthRepository(), FakeExpenseRepository(loadError = IllegalStateException("Network unavailable"))
        )
        advanceUntilIdle()
        assertEquals("Network unavailable", viewModel.uiState.value.error)
        assertTrue(viewModel.uiState.value.expenses.isEmpty())
        assertFalse(viewModel.uiState.value.isLoading)
    }
}

private fun expense(
    id: String,
    amount: Double,
    category: String,
    type: String = "expense"
) = PersonalExpense(id, "user", id, amount, category, type, null, null, "2026-08-10", "2026-08-10T00:00:00Z")

private class FakeExpenseRepository(
    private val existing: PersonalExpense? = null,
    private val updateResult: Boolean = true,
    private val monthRows: List<PersonalExpense> = listOfNotNull(existing),
    private val rowsByMonth: Map<Int, List<PersonalExpense>> = emptyMap(),
    private val delaysByMonth: Map<Int, Long> = emptyMap(),
    private val defaultDelay: Long = 0L,
    private val loadError: Exception? = null
) : ExpenseRepository {
    var savedType: String? = null
    var updated = false
    override suspend fun getPersonalExpenses(userId: String): List<PersonalExpense> {
        loadError?.let { throw it }
        return if (rowsByMonth.isNotEmpty()) rowsByMonth.values.flatten() else monthRows
    }
    override suspend fun getPersonalExpenseById(expenseId: String) = existing
    override suspend fun getPersonalExpensesByMonth(userId: String, year: Int, month: Int): List<PersonalExpense> {
        loadError?.let { throw it }
        delay(delaysByMonth[month] ?: defaultDelay)
        return rowsByMonth[month] ?: monthRows
    }
    override suspend fun addPersonalExpense(userId: String, title: String, amount: Double, category: String, type: String, note: String?, expenseDate: String): Boolean {
        savedType = type
        return true
    }
    override suspend fun updatePersonalExpense(expenseId: String, title: String, amount: Double, category: String, type: String, note: String?, expenseDate: String): Boolean {
        updated = true
        return updateResult
    }
    override suspend fun deletePersonalExpense(expenseId: String) = true
    override suspend fun getMonthlyTotal(userId: String, year: Int, month: Int, type: String) = 0.0
}

private class FakeAuthRepository : AuthRepository {
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
