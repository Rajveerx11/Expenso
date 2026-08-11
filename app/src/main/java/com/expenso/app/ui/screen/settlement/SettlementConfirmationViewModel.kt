package com.expenso.app.ui.screen.settlement

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.Settlement
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.SettlementRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettlementConfirmationUiState(
    val isLoading: Boolean = true,
    val isSubmitting: Boolean = false,
    val settlement: Settlement? = null,
    val canRespond: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class SettlementConfirmationViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val settlementRepository: SettlementRepository
) : ViewModel() {
    private val groupId: String = checkNotNull(savedStateHandle["groupId"])
    private val settlementId: String = checkNotNull(savedStateHandle["settlementId"])
    private val _uiState = MutableStateFlow(SettlementConfirmationUiState())
    val uiState: StateFlow<SettlementConfirmationUiState> = _uiState.asStateFlow()
    private var currentUserId: String? = null

    init { load() }

    private fun load() {
        viewModelScope.launch {
            try {
                currentUserId = authRepository.getCurrentUserId()
                val settlement = settlementRepository.getGroupSettlements(groupId).firstOrNull { it.id == settlementId }
                _uiState.value = if (settlement == null) {
                    SettlementConfirmationUiState(isLoading = false, error = "Settlement not found")
                } else {
                    SettlementConfirmationUiState(
                        isLoading = false,
                        settlement = settlement,
                        canRespond = settlement.status == "pending_confirmation" && settlement.receiverId == currentUserId
                    )
                }
            } catch (error: Exception) {
                _uiState.value = SettlementConfirmationUiState(
                    isLoading = false,
                    error = error.message ?: "Could not load this settlement"
                )
            }
        }
    }

    fun confirm() = respond(confirm = true)
    fun reject() = respond(confirm = false)

    private fun respond(confirm: Boolean) {
        val state = _uiState.value
        val userId = currentUserId
        val settlement = state.settlement
        if (state.isSubmitting || !state.canRespond || userId == null || settlement == null) return
        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            val succeeded = if (confirm) {
                settlementRepository.confirmSettlement(settlement.id, userId)
            } else {
                settlementRepository.rejectSettlement(settlement.id, userId)
            }
            _uiState.update {
                if (succeeded) {
                    it.copy(
                        isSubmitting = false,
                        canRespond = false,
                        settlement = settlement.copy(status = if (confirm) "confirmed" else "rejected")
                    )
                } else {
                    it.copy(isSubmitting = false, error = "Could not update this settlement")
                }
            }
        }
    }
}
