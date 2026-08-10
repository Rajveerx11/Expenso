package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ExpenseSplitDto(
    @SerialName("id") val id: String,
    @SerialName("expense_id") val expenseId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("owed_amount") val owedAmount: Double,
    @SerialName("is_settled") val isSettled: Boolean,
    @SerialName("settled_at") val settledAt: String? = null
)

@Serializable
data class CreateExpenseSplitDto(
    @SerialName("expense_id") val expenseId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("owed_amount") val owedAmount: Double,
    @SerialName("is_settled") val isSettled: Boolean = false
)
