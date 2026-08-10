package com.expenso.app.ui.screen.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.model.User
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ExpenseRepository
import com.expenso.app.domain.repository.GroupRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class HomeUiState(
    val user: User? = null,
    val totalIncome: Double = 0.0,
    val totalExpenses: Double = 0.0,
    val netBalance: Double = 0.0,
    val recentExpenses: List<PersonalExpense> = emptyList(),
    val groupCount: Int = 0,
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val expenseRepository: ExpenseRepository,
    private val groupRepository: GroupRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadData()
    }

    fun refresh() {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val user = authRepository.getCurrentUser()
                val userId = user?.id ?: return@launch

                val calendar = Calendar.getInstance()
                val currentYear = calendar.get(Calendar.YEAR)
                val currentMonth = calendar.get(Calendar.MONTH)

                val expenses = expenseRepository.getPersonalExpensesByMonth(userId, currentYear, currentMonth)
                
                var income = 0.0
                var expenseTotal = 0.0
                
                expenses.forEach {
                    if (it.type == "income") {
                        income += it.amount
                    } else if (it.type == "expense") {
                        expenseTotal += it.amount
                    }
                }
                
                val recent = expenses.sortedByDescending { it.expenseDate }.take(5)
                val groups = groupRepository.getUserGroups(userId)

                _uiState.update {
                    it.copy(
                        user = user,
                        totalIncome = income,
                        totalExpenses = expenseTotal,
                        netBalance = income - expenseTotal,
                        recentExpenses = recent,
                        groupCount = groups.size,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "An error occurred"
                    )
                }
            }
        }
    }

    fun deleteExpense(expenseId: String) {
        viewModelScope.launch {
            try {
                val success = expenseRepository.deletePersonalExpense(expenseId)
                if (success) {
                    loadData()
                } else {
                    _uiState.update { it.copy(error = "Failed to delete expense") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to delete expense") }
            }
        }
    }
}
