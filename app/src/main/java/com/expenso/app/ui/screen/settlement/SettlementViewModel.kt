package com.expenso.app.ui.screen.settlement

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import com.expenso.app.domain.repository.SettlementRepository
import com.expenso.app.domain.model.validatedSettlementAmount
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
    val maxAmount: Double = 0.0,
    val amountInput: String = "",
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
                val userId = authRepository.getCurrentUserId() ?: error("Sign in again to view settlements")
                val balances = groupRepository.getGroupBalances(groupId, userId)
                val memberBalance = balances.find { it.userId == receiverId }
                
                if (memberBalance != null && memberBalance.balance < 0) {
                    _uiState.update { 
                        it.copy(
                            receiverName = memberBalance.userName,
                            maxAmount = abs(memberBalance.balance),
                            amountInput = String.format(java.util.Locale.ROOT, "%.2f", abs(memberBalance.balance)),
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

    fun updateAmount(amount: String) {
        if (amount.isEmpty() || amount.matches(Regex("^\\d*\\.?\\d{0,2}$"))) {
            _uiState.update { it.copy(amountInput = amount, error = null) }
        }
    }

    fun settle() {
        if (_uiState.value.isLoading || _uiState.value.isSuccess) return
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val userId = authRepository.getCurrentUserId() ?: error("Sign in again to send a settlement")
                val amount = validatedSettlementAmount(
                    _uiState.value.amountInput,
                    _uiState.value.maxAmount
                )
                val success = settlementRepository.createSettlement(
                    groupId = groupId,
                    payerId = userId,
                    receiverId = receiverId,
                    amount = amount,
                    transactionRef = _uiState.value.transactionRef.trim().takeIf { it.isNotEmpty() }
                )
                
                if (success) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Could not send settlement request") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
