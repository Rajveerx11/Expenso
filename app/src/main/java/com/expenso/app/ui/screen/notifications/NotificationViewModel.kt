package com.expenso.app.ui.screen.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.expenso.app.domain.model.AppNotification
import com.expenso.app.domain.repository.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotificationUiState(
    val isLoading: Boolean = true,
    val notifications: List<AppNotification> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class NotificationViewModel @Inject constructor(
    private val repository: NotificationRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(NotificationUiState())
    val uiState: StateFlow<NotificationUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            repository.getNotifications().fold(
                onSuccess = { items ->
                    _uiState.value = NotificationUiState(isLoading = false, notifications = items)
                },
                onFailure = { error ->
                    _uiState.update { it.copy(isLoading = false, error = error.message ?: "Unable to load notifications") }
                }
            )
        }
    }

    fun markRead(notificationId: String) {
        _uiState.update { state ->
            state.copy(notifications = state.notifications.map {
                if (it.id == notificationId) it.copy(isRead = true) else it
            })
        }
        viewModelScope.launch {
            if (repository.markRead(notificationId).isFailure) refresh()
        }
    }

    fun markAllRead() {
        _uiState.update { state ->
            state.copy(notifications = state.notifications.map { it.copy(isRead = true) })
        }
        viewModelScope.launch {
            if (repository.markRead().isFailure) refresh()
        }
    }
}
