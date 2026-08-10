package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PersonalExpenseDto(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("title") val title: String,
    @SerialName("amount") val amount: Double,
    @SerialName("category") val category: String,
    @SerialName("type") val type: String,
    @SerialName("note") val note: String? = null,
    @SerialName("source_group_expense_id") val sourceGroupExpenseId: String? = null,
    @SerialName("expense_date") val expenseDate: String,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class CreatePersonalExpenseDto(
    @SerialName("user_id") val userId: String,
    @SerialName("title") val title: String,
    @SerialName("amount") val amount: Double,
    @SerialName("category") val category: String,
    @SerialName("type") val type: String,
    @SerialName("note") val note: String? = null,
    @SerialName("expense_date") val expenseDate: String
)

@Serializable
data class UpdatePersonalExpenseDto(
    @SerialName("title") val title: String,
    @SerialName("amount") val amount: Double,
    @SerialName("category") val category: String,
    @SerialName("type") val type: String,
    @SerialName("note") val note: String? = null,
    @SerialName("expense_date") val expenseDate: String
)
