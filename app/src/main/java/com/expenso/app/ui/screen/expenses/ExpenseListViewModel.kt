package com.expenso.app.ui.screen.expenses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ExpenseRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId() ?: return@launch
                val state = _uiState.value
                
                val expenses = expenseRepository.getPersonalExpensesByMonth(
                    userId = userId, 
                    year = state.currentYear, 
                    month = state.currentMonth
                ).sortedByDescending { it.expenseDate }
                
                var income = 0.0
                var expenseTotal = 0.0
                
                expenses.forEach {
                    if (it.type == "income") {
                        income += it.amount
                    } else if (it.type == "expense") {
                        expenseTotal += it.amount
                    }
                }
                
                val filtered = filterExpenses(expenses, state.selectedFilter)
                
                _uiState.update {
                    it.copy(
                        expenses = expenses,
                        filteredExpenses = filtered,
                        monthlyIncome = income,
                        monthlyExpenses = expenseTotal,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
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
}
