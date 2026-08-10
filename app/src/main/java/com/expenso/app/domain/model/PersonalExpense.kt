package com.expenso.app.domain.model

data class PersonalExpense(
    val id: String,
    val userId: String,
    val title: String,
    val amount: Double,
    val category: String,
    val type: String, // "income" or "expense"
    val note: String?,
    val sourceGroupExpenseId: String?,
    val expenseDate: String,
    val createdAt: String
)
