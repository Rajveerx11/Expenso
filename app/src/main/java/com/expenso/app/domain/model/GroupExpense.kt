package com.expenso.app.domain.model

data class GroupExpense(
    val id: String,
    val groupId: String,
    val paidBy: String,
    val paidByName: String = "",
    val title: String,
    val totalAmount: Double,
    val category: String,
    val splitType: String, // "equal", "exact", "percentage"
    val note: String?,
    val expenseDate: String,
    val createdAt: String
)
