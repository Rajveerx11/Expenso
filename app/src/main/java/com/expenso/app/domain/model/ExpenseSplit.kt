package com.expenso.app.domain.model

data class ExpenseSplit(
    val id: String,
    val expenseId: String,
    val userId: String,
    val userName: String = "",
    val owedAmount: Double,
    val isSettled: Boolean,
    val settledAt: String?
)
