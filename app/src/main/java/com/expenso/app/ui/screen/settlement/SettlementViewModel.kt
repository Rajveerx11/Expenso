package com.expenso.app.ui.screen.settlement

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import com.expenso.app.domain.repository.SettlementRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs

data class SettlementUiState(
    val receiverName: String = "",
    val receiverUpiId: String? = null,
    val amount: Double = 0.0,
    val transactionRef: String = "",
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class SettlementViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val groupRepository: GroupRepository,
    private val settlementRepository: SettlementRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val groupId: String = checkNotNull(savedStateHandle["groupId"])
    private val receiverId: String = checkNotNull(savedStateHandle["receiverId"])
    private val _uiState = MutableStateFlow(SettlementUiState())
    val uiState: StateFlow<SettlementUiState> = _uiState.asStateFlow()

    init {
        loadDetails()
    }

    private fun loadDetails() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val userId = authRepository.getCurrentUserId() ?: return@launch
                val balances = groupRepository.getGroupBalances(groupId, userId)
                val memberBalance = balances.find { it.userId == receiverId }
                
                if (memberBalance != null && memberBalance.balance < 0) {
                    _uiState.update { 
                        it.copy(
                            receiverName = memberBalance.userName,
                            amount = abs(memberBalance.balance),
                            isLoading = false
                        )
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "No settlement needed") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun updateTransactionRef(ref: String) {
        _uiState.update { it.copy(transactionRef = ref) }
    }

    fun settle() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId() ?: return@launch
                // We're using groupRepository.addGroupExpense as a way to create a settlement
                // In a real app we might use a dedicated settlement repository
                val success = groupRepository.addGroupExpense(
                    groupId = groupId,
                    paidBy = userId,
                    title = "Settlement to ${_uiState.value.receiverName}",
                    totalAmount = _uiState.value.amount,
                    category = "Other",
                    splitType = "exact",
                    note = "Transaction Ref: ${_uiState.value.transactionRef}",
                    expenseDate = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date()),
                    splits = listOf(
                        receiverId to _uiState.value.amount
                    )
                )
                
                if (success) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Settlement failed") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
