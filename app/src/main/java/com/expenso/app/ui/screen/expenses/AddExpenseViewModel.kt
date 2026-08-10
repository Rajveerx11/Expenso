package com.expenso.app.ui.screen.expenses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ExpenseRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class AddExpenseUiState(
    val title: String = "",
    val amount: String = "",
    val category: String = "Other",
    val type: String = "expense", // "income" or "expense"
    val note: String = "",
    val expenseDate: String = "",
    val isEditing: Boolean = false,
    val isLinkedGroupExpense: Boolean = false,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddExpenseViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val expenseRepository: ExpenseRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AddExpenseUiState())
    val uiState: StateFlow<AddExpenseUiState> = _uiState.asStateFlow()

    private val expenseId: String? = savedStateHandle["expenseId"]

    init {
        updateDate(LocalDate.now().toString())
        expenseId?.let(::loadExpense)
    }

    private fun loadExpense(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val expense = expenseRepository.getPersonalExpenseById(id)
                    ?: error("Transaction not found")
                _uiState.update {
                    it.copy(
                        title = expense.title,
                        amount = expense.amount.toString(),
                        category = expense.category,
                        type = expense.type,
                        note = expense.note.orEmpty(),
                        expenseDate = expense.expenseDate.substringBefore('T'),
                        isEditing = true,
                        isLinkedGroupExpense = expense.sourceGroupExpenseId != null,
                        isLoading = false
                    )
                }
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = error.message ?: "Could not load transaction")
                }
            }
        }
    }

    fun updateTitle(title: String) {
        _uiState.update { it.copy(title = title, error = null) }
    }

    fun updateAmount(amount: String) {
        // Allow only digits and one decimal point
        if (amount.isEmpty() || amount.matches(Regex("^\\d*\\.?\\d*$"))) {
            _uiState.update { it.copy(amount = amount, error = null) }
        }
    }

    fun updateCategory(category: String) {
        _uiState.update { it.copy(category = category) }
    }

    fun updateType(type: String) {
        _uiState.update { it.copy(type = type) }
    }

    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note) }
    }

    fun updateDate(date: String) {
        _uiState.update { it.copy(expenseDate = date) }
    }

    fun saveExpense() {
        val state = _uiState.value
        if (state.isLinkedGroupExpense) {
            _uiState.update { it.copy(error = "Group transactions must be edited from the group") }
            return
        }
        
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title cannot be empty") }
            return
        }
        
        val amountValue = state.amount.toDoubleOrNull()
        if (amountValue == null || amountValue <= 0) {
            _uiState.update { it.copy(error = "Amount must be greater than zero") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId()
                if (userId == null) {
                    _uiState.update { it.copy(isLoading = false, error = "User not logged in") }
                    return@launch
                }
                
                val success = if (expenseId == null) {
                    expenseRepository.addPersonalExpense(
                        userId = userId,
                        title = state.title.trim(),
                        amount = amountValue,
                        category = state.category,
                        type = state.type,
                        note = state.note.takeIf { it.isNotBlank() },
                        expenseDate = state.expenseDate
                    )
                } else {
                    expenseRepository.updatePersonalExpense(
                        expenseId = expenseId,
                        title = state.title.trim(),
                        amount = amountValue,
                        category = state.category,
                        type = state.type,
                        note = state.note.takeIf { it.isNotBlank() },
                        expenseDate = state.expenseDate
                    )
                }
                
                if (success) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to save transaction") }
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false, 
                        error = e.message ?: "An error occurred while saving"
                    ) 
                }
            }
        }
    }
}
