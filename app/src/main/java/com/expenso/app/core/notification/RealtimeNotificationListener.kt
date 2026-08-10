package com.expenso.app.core.notification

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonPrimitive
import io.github.jan.supabase.realtime.realtime
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealtimeNotificationListener @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val notificationManager: ExpensoNotificationManager
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isListening = false

    fun startListening(currentUserId: String) {
        if (isListening) return
        isListening = true

        scope.launch {
            try {
                // Listen for new group expenses
                val expenseChannel = supabaseClient.channel("group_expenses_channel")
                
                expenseChannel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                    table = "group_expenses"
                }.onEach { change ->
                    val record = change.record
                    val paidBy = record["paid_by"]?.jsonPrimitive?.content
                    if (paidBy != currentUserId) {
                        val title = record["title"]?.jsonPrimitive?.content ?: "New Expense"
                        val amount = record["total_amount"]?.jsonPrimitive?.content ?: "0"
                        notificationManager.showExpenseNotification(
                            title = "New Group Expense",
                            message = "₹$amount added for \"$title\""
                        )
                    }
                }.launchIn(scope)

                // Listen for new settlements
                val settlementChannel = supabaseClient.channel("settlements_channel")
                
                settlementChannel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                    table = "settlements"
                }.onEach { change ->
                    val record = change.record
                    val receiverId = record["receiver_id"]?.jsonPrimitive?.content
                    if (receiverId == currentUserId) {
                        val amount = record["amount"]?.jsonPrimitive?.content ?: "0"
                        notificationManager.showPaymentNotification(
                            title = "Settlement Request",
                            message = "Someone wants to settle ₹$amount with you"
                        )
                    }
                }.launchIn(scope)

                // Listen for settlement confirmations
                val confirmChannel = supabaseClient.channel("settlement_updates_channel")
                
                confirmChannel.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
                    table = "settlements"
                }.onEach { change ->
                    val record = change.record
                    val status = record["status"]?.jsonPrimitive?.content
                    val payerId = record["payer_id"]?.jsonPrimitive?.content
                    if (payerId == currentUserId && status == "confirmed") {
                        val amount = record["amount"]?.jsonPrimitive?.content ?: "0"
                        notificationManager.showPaymentNotification(
                            title = "Payment Confirmed! ✅",
                            message = "Your settlement of ₹$amount has been confirmed"
                        )
                    }
                }.launchIn(scope)

                // Listen for group member additions
                val memberChannel = supabaseClient.channel("group_members_channel")
                
                memberChannel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                    table = "group_members"
                }.onEach { change ->
                    val record = change.record
                    val userId = record["user_id"]?.jsonPrimitive?.content
                    if (userId == currentUserId) {
                        notificationManager.showGroupNotification(
                            title = "Added to Group! 🎉",
                            message = "You've been added to a new expense group"
                        )
                    }
                }.launchIn(scope)

                expenseChannel.subscribe()
                settlementChannel.subscribe()
                confirmChannel.subscribe()
                memberChannel.subscribe()
            } catch (e: Exception) {
                e.printStackTrace()
                isListening = false
            }
        }
    }

    fun stopListening() {
        isListening = false
        scope.launch {
            try {
                supabaseClient.realtime.removeAllChannels()
            } catch (_: Exception) {}
        }
    }
}
