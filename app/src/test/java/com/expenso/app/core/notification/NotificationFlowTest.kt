package com.expenso.app.core.notification

import com.expenso.app.domain.model.AppNotification
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationFlowTest {
    private val groupId = "20000000-0000-0000-0000-000000000001"
    private val settlementId = "30000000-0000-0000-0000-000000000001"
    private val notificationId = "40000000-0000-0000-0000-000000000001"

    @Test
    fun `settlement payload routes to confirmation screen`() {
        val payload = NotificationRoute.fromData(
            mapOf(
                "notification_id" to notificationId,
                "type" to "settlement_request",
                "title" to "Settlement request",
                "message" to "Please confirm",
                "deep_link" to "expenso://settlement/$groupId/$settlementId"
            )
        )
        assertNotNull(payload)
        assertEquals("settlement_confirmation/$groupId/$settlementId", NotificationRoute.toAppRoute(payload?.deepLink))
    }

    @Test
    fun `group and inbox deep links are constrained`() {
        assertEquals("group_detail/$groupId", NotificationRoute.toAppRoute("expenso://group/$groupId"))
        assertEquals("notifications", NotificationRoute.toAppRoute("expenso://notifications"))
        assertNull(NotificationRoute.toAppRoute("https://evil.example/group/$groupId"))
        assertNull(NotificationRoute.toAppRoute("expenso://group/not-a-uuid"))
    }

    @Test
    fun `inbox settlement row routes to confirmation`() {
        val notification = AppNotification(
            id = notificationId,
            title = "Settlement",
            message = "Confirm",
            type = "settlement_request",
            groupId = groupId,
            relatedId = settlementId,
            isRead = false,
            createdAt = "2026-08-10T00:00:00Z"
        )
        assertEquals(
            "settlement_confirmation/$groupId/$settlementId",
            NotificationRoute.forNotification(notification)
        )
    }

    @Test
    fun `token lifecycle skips exact registration but handles rotation and user changes`() {
        assertFalse(PushTokenLifecycle.shouldRegister("user-a", "token-a", "user-a", "token-a"))
        assertTrue(PushTokenLifecycle.shouldRegister("user-a", "token-b", "user-a", "token-a"))
        assertTrue(PushTokenLifecycle.shouldRegister("user-b", "token-a", "user-a", "token-a"))
        assertTrue(PushTokenLifecycle.canCompleteUnregistration(serverRemoved = true, firebaseInvalidated = false))
        assertTrue(PushTokenLifecycle.canCompleteUnregistration(serverRemoved = false, firebaseInvalidated = true))
        assertFalse(PushTokenLifecycle.canCompleteUnregistration(serverRemoved = false, firebaseInvalidated = false))
    }

    @Test
    fun `permission is requested once after authentication`() {
        assertTrue(NotificationPermissionPolicy.shouldRequest(35, true, false, false))
        assertFalse(NotificationPermissionPolicy.shouldRequest(35, true, false, true))
        assertFalse(NotificationPermissionPolicy.shouldRequest(35, true, true, false))
        assertFalse(NotificationPermissionPolicy.shouldRequest(32, true, false, false))
        assertFalse(NotificationPermissionPolicy.shouldRequest(35, false, false, false))
    }
}
