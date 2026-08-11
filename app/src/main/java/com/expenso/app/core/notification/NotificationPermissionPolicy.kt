package com.expenso.app.core.notification

object NotificationPermissionPolicy {
    fun shouldRequest(
        sdkInt: Int,
        isAuthenticated: Boolean,
        isGranted: Boolean,
        wasAlreadyRequested: Boolean
    ): Boolean = sdkInt >= 33 && isAuthenticated && !isGranted && !wasAlreadyRequested
}
