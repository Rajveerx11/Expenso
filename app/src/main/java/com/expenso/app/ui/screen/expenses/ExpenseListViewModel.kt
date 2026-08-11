package com.expenso.app.ui.screen.expenses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.model.ExpenseAnalytics
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ExpenseRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class ExpenseListUiState(
    val expenses: List<PersonalExpense> = emptyList(),
    val filteredExpenses: List<PersonalExpense> = emptyList(),
    val selectedFilter: String = "all", // "all", "income", "expense"
    val currentMonth: Int = 0,
    val currentYear: Int = 2024,
    val monthlyIncome: Double = 0.0,
    val monthlyExpenses: Double = 0.0,
    val monthlyNet: Double = 0.0,
    val lifetimeIncome: Double = 0.0,
    val lifetimeExpenses: Double = 0.0,
    val lifetimeNet: Double = 0.0,
    val categoryExpenses: Map<String, Double> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class ExpenseListViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val expenseRepository: ExpenseRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ExpenseListUiState())
    val uiState: StateFlow<ExpenseListUiState> = _uiState.asStateFlow()
    private var loadJob: Job? = null

    init {
        val calendar = Calendar.getInstance()
        _uiState.update { 
            it.copy(
                currentMonth = calendar.get(Calendar.MONTH),
                currentYear = calendar.get(Calendar.YEAR)
            )
        }
        loadExpenses()
    }

    fun loadExpenses() {
        loadJob?.cancel()
        val requestedState = _uiState.value
        loadJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId()
                    ?: error("Sign in again to view transactions")
                val expenses = expenseRepository.getPersonalExpensesByMonth(
                    userId = userId, 
                    year = requestedState.currentYear,
                    month = requestedState.currentMonth
                ).sortedByDescending { it.expenseDate }
                
                val allExpenses = expenseRepository.getPersonalExpenses(userId)
                val monthlyAnalytics = ExpenseAnalytics.from(expenses)
                val lifetimeAnalytics = ExpenseAnalytics.from(allExpenses)
                
                _uiState.update { current ->
                    if (current.currentMonth != requestedState.currentMonth ||
                        current.currentYear != requestedState.currentYear
                    ) current else current.copy(
                        expenses = expenses,
                        filteredExpenses = filterExpenses(expenses, current.selectedFilter),
                        monthlyIncome = monthlyAnalytics.income,
                        monthlyExpenses = monthlyAnalytics.expenses,
                        monthlyNet = monthlyAnalytics.net,
                        lifetimeIncome = lifetimeAnalytics.income,
                        lifetimeExpenses = lifetimeAnalytics.expenses,
                        lifetimeNet = lifetimeAnalytics.net,
                        categoryExpenses = monthlyAnalytics.categoryExpenses,
                        isLoading = false
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (e: Exception) {
                _uiState.update { current ->
                    if (current.currentMonth != requestedState.currentMonth ||
                        current.currentYear != requestedState.currentYear
                    ) current else current.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to load expenses"
                    )
                }
            }
        }
    }

    fun setFilter(filter: String) {
        val expenses = _uiState.value.expenses
        val filtered = filterExpenses(expenses, filter)
        _uiState.update { 
            it.copy(
                selectedFilter = filter,
                filteredExpenses = filtered
            ) 
        }
    }
    
    private fun filterExpenses(expenses: List<PersonalExpense>, filter: String): List<PersonalExpense> {
        return when (filter) {
            "income" -> expenses.filter { it.type == "income" }
            "expense" -> expenses.filter { it.type == "expense" }
            else -> expenses
        }
    }

    fun changeMonth(month: Int, year: Int) {
        _uiState.update { 
            it.copy(
                currentMonth = month,
                currentYear = year
            )
        }
        loadExpenses()
    }

    fun deleteExpense(expenseId: String) {
        if (_uiState.value.expenses.any { it.id == expenseId && it.sourceGroupExpenseId != null }) {
            _uiState.update { it.copy(error = "Group transactions must be changed from the group") }
            return
        }
        viewModelScope.launch {
            try {
                val success = expenseRepository.deletePersonalExpense(expenseId)
                if (success) {
                    loadExpenses()
                } else {
                    _uiState.update { it.copy(error = "Failed to delete expense") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to delete expense") }
            }
        }
    }

    fun clearError() = _uiState.update { it.copy(error = null) }
}
