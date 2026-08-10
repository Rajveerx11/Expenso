package com.expenso.app.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GroupExpenseDto(
    @SerialName("id") val id: String,
    @SerialName("group_id") val groupId: String,
    @SerialName("paid_by") val paidBy: String,
    @SerialName("title") val title: String,
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("category") val category: String,
    @SerialName("split_type") val splitType: String,
    @SerialName("note") val note: String? = null,
    @SerialName("expense_date") val expenseDate: String,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = ""
)

@Serializable
data class CreateGroupExpenseDto(
    @SerialName("group_id") val groupId: String,
    @SerialName("paid_by") val paidBy: String,
    @SerialName("title") val title: String,
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("category") val category: String,
    @SerialName("split_type") val splitType: String,
    @SerialName("note") val note: String? = null,
    @SerialName("expense_date") val expenseDate: String
)
