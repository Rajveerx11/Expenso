package com.expenso.app.ui.screen.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.GroupRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CreateGroupUiState(
    val name: String = "",
    val description: String = "",
    val pendingMembers: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class CreateGroupViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val groupRepository: GroupRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CreateGroupUiState())
    val uiState: StateFlow<CreateGroupUiState> = _uiState.asStateFlow()

    fun updateName(name: String) {
        _uiState.update { it.copy(name = name, error = null) }
    }

    fun updateDescription(description: String) {
        _uiState.update { it.copy(description = description) }
    }
    
    fun addPendingMember(email: String) {
        if (email.isNotBlank() && email !in _uiState.value.pendingMembers) {
            _uiState.update { it.copy(pendingMembers = it.pendingMembers + email) }
        }
    }
    
    fun removePendingMember(email: String) {
        _uiState.update { it.copy(pendingMembers = it.pendingMembers - email) }
    }

    fun createGroup() {
        val name = _uiState.value.name
        if (name.isBlank()) {
            _uiState.update { it.copy(error = "Group name is required") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val userId = authRepository.getCurrentUserId()
                if (userId != null) {
                    val groupId = groupRepository.createGroup(
                        name = name,
                        description = _uiState.value.description.takeIf { it.isNotBlank() },
                        createdBy = userId
                    )
                    if (groupId != null) {
                        // Try to add pending members (best effort)
                        _uiState.value.pendingMembers.forEach { email ->
                            try {
                                groupRepository.addGroupMember(groupId, email)
                            } catch (_: Exception) { }
                        }
                        _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                    } else {
                        _uiState.update { it.copy(isLoading = false, error = "Failed to create group. Check your connection.") }
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "User not logged in") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
