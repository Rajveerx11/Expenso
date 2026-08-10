package com.expenso.app.ui.screen.groups

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlin.math.abs

data class AddGroupExpenseUiState(
    val title: String = "",
    val totalAmount: String = "",
    val category: String = "Other",
    val note: String = "",
    val expenseDate: String = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
    val members: List<GroupMember> = emptyList(),
    val paidByUserId: String = "",
    val paidByName: String = "",
    val splitType: String = "equal", // "equal", "exact", "percentage"
    val selectedMembersForSplit: Map<String, Boolean> = emptyMap(),
    val exactAmounts: Map<String, String> = emptyMap(),
    val percentages: Map<String, String> = emptyMap(),
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class AddGroupExpenseViewModel @Inject constructor(
    private val groupRepository: GroupRepository,
    private val authRepository: AuthRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val groupId: String = checkNotNull(savedStateHandle["groupId"])

    private val _uiState = MutableStateFlow(AddGroupExpenseUiState())
    val uiState: StateFlow<AddGroupExpenseUiState> = _uiState.asStateFlow()

    init {
        loadInitialData()
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val currentUserId = authRepository.getCurrentUserId() ?: ""
                val currentUser = authRepository.getCurrentUser()
                val currentUserName = currentUser?.fullName ?: "You"

                val members = groupRepository.getGroupMembers(groupId)

                val initialSelections = members.associate { it.userId to true }
                val initialExact = members.associate { it.userId to "" }
                val initialPercentages = members.associate { it.userId to "" }

                _uiState.update {
                    it.copy(
                        members = members,
                        paidByUserId = currentUserId,
                        paidByName = currentUserName,
                        selectedMembersForSplit = initialSelections,
                        exactAmounts = initialExact,
                        percentages = initialPercentages,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun updateTitle(title: String) {
        _uiState.update { it.copy(title = title) }
    }

    fun updateAmount(amount: String) {
        _uiState.update { it.copy(totalAmount = amount) }
    }

    fun updateCategory(category: String) {
        _uiState.update { it.copy(category = category) }
    }

    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note) }
    }

    fun updateDate(date: String) {
        _uiState.update { it.copy(expenseDate = date) }
    }

    fun setPaidBy(userId: String, name: String) {
        _uiState.update { it.copy(paidByUserId = userId, paidByName = name) }
    }

    fun setSplitType(type: String) {
        _uiState.update { it.copy(splitType = type) }
    }

    fun toggleMemberSelection(userId: String) {
        _uiState.update { state ->
            val current = state.selectedMembersForSplit[userId] ?: false
            state.copy(
                selectedMembersForSplit = state.selectedMembersForSplit.toMutableMap().apply {
                    put(userId, !current)
                }
            )
        }
    }

    fun updateExactAmount(userId: String, amount: String) {
        _uiState.update { state ->
            state.copy(
                exactAmounts = state.exactAmounts.toMutableMap().apply {
                    put(userId, amount)
                }
            )
        }
    }

    fun updatePercentage(userId: String, percentage: String) {
        _uiState.update { state ->
            state.copy(
                percentages = state.percentages.toMutableMap().apply {
                    put(userId, percentage)
                }
            )
        }
    }

    fun saveExpense() {
        val state = _uiState.value
        val amount = state.totalAmount.toDoubleOrNull() ?: 0.0

        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title cannot be empty") }
            return
        }
        if (amount <= 0) {
            _uiState.update { it.copy(error = "Amount must be greater than zero") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val splits = mutableListOf<Pair<String, Double>>()
                
                when (state.splitType) {
                    "equal" -> {
                        val selectedUsers = state.selectedMembersForSplit.filterValues { it }.keys
                        if (selectedUsers.isEmpty()) {
                            _uiState.update { it.copy(isLoading = false, error = "Select at least one member") }
                            return@launch
                        }
                        val splitAmount = amount / selectedUsers.size
                        selectedUsers.forEach { userId ->
                            splits.add(userId to splitAmount)
                        }
                    }
                    "exact" -> {
                        var sum = 0.0
                        state.members.forEach { member ->
                            val exactVal = state.exactAmounts[member.userId]?.toDoubleOrNull() ?: 0.0
                            if (exactVal > 0) {
                                splits.add(member.userId to exactVal)
                                sum += exactVal
                            }
                        }
                        if (abs(sum - amount) > 0.01) {
                            _uiState.update { it.copy(isLoading = false, error = "Total exact amounts do not match total amount") }
                            return@launch
                        }
                    }
                    "percentage" -> {
                        var sumPercent = 0.0
                        state.members.forEach { member ->
                            val percentVal = state.percentages[member.userId]?.toDoubleOrNull() ?: 0.0
                            if (percentVal > 0) {
                                splits.add(member.userId to (amount * percentVal / 100.0))
                                sumPercent += percentVal
                            }
                        }
                        if (abs(sumPercent - 100.0) > 0.01) {
                            _uiState.update { it.copy(isLoading = false, error = "Total percentages must equal 100") }
                            return@launch
                        }
                    }
                }

                val success = groupRepository.addGroupExpense(
                    groupId = groupId,
                    paidBy = state.paidByUserId,
                    title = state.title.trim(),
                    totalAmount = amount,
                    category = state.category,
                    splitType = state.splitType,
                    note = state.note.takeIf { it.isNotBlank() },
                    expenseDate = state.expenseDate,
                    splits = splits
                )

                if (success) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to add expense") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }
    
    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
