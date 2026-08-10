package com.expenso.app.ui.screen.groups

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import com.expenso.app.domain.repository.SettlementRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class GroupDetailUiState(
    val group: Group? = null,
    val members: List<GroupMember> = emptyList(),
    val expenses: List<GroupExpense> = emptyList(),
    val balances: List<GroupBalance> = emptyList(),
    val currentUserId: String = "",
    val isAdmin: Boolean = false,
    val selectedTab: Int = 0,
    val isLoading: Boolean = false,
    val isAddingMember: Boolean = false,
    val addMemberSuccess: String? = null,
    val addMemberError: String? = null,
    val error: String? = null
)

@HiltViewModel
class GroupDetailViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val groupRepository: GroupRepository,
    private val settlementRepository: SettlementRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val groupId: String = checkNotNull(savedStateHandle["groupId"])

    private val _uiState = MutableStateFlow(GroupDetailUiState())
    val uiState: StateFlow<GroupDetailUiState> = _uiState.asStateFlow()

    init {
        loadGroupDetail()
    }

    fun loadGroupDetail() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId() ?: return@launch
                
                val groupDeferred = async { groupRepository.getGroupById(groupId) }
                val membersDeferred = async { groupRepository.getGroupMembers(groupId) }
                val expensesDeferred = async { groupRepository.getGroupExpenses(groupId) }
                val balancesDeferred = async { groupRepository.getGroupBalances(groupId, userId) }
                
                val group = groupDeferred.await()
                val members = membersDeferred.await()
                val expenses = expensesDeferred.await()
                val balances = balancesDeferred.await()
                
                val isAdmin = group?.createdBy == userId

                _uiState.update { 
                    it.copy(
                        group = group,
                        members = members,
                        expenses = expenses,
                        balances = balances,
                        currentUserId = userId,
                        isAdmin = isAdmin,
                        isLoading = false
                    ) 
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Failed to load group details") }
            }
        }
    }
    
    fun selectTab(index: Int) {
        _uiState.update { it.copy(selectedTab = index) }
    }

    fun refresh() {
        loadGroupDetail()
    }
    
    fun addMemberByEmail(email: String) {
        if (email.isBlank()) {
            _uiState.update { it.copy(addMemberError = "Please enter an email address") }
            return
        }
        
        // Check if already a member
        val existingEmails = _uiState.value.members.map { it.userEmail.lowercase() }
        if (email.lowercase() in existingEmails) {
            _uiState.update { it.copy(addMemberError = "This user is already a member") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isAddingMember = true, addMemberError = null) }
            try {
                val success = groupRepository.addGroupMember(groupId, email.trim())
                if (success) {
                    _uiState.update { 
                        it.copy(
                            isAddingMember = false, 
                            addMemberSuccess = "Member added successfully!",
                            addMemberError = null
                        ) 
                    }
                    refresh()
                } else {
                    _uiState.update { 
                        it.copy(
                            isAddingMember = false, 
                            addMemberError = "User not found. They must be registered on Expenso."
                        ) 
                    }
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isAddingMember = false, 
                        addMemberError = e.message ?: "Failed to add member"
                    ) 
                }
            }
        }
    }
    
    fun clearAddMemberMessages() {
        _uiState.update { it.copy(addMemberSuccess = null, addMemberError = null) }
    }
    
    fun removeMember(memberId: String) {
        viewModelScope.launch {
            try {
                if (groupRepository.removeGroupMember(groupId, memberId)) {
                    refresh()
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
}
