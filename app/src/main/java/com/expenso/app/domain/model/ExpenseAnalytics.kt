package com.expenso.app.domain.model

data class ExpenseAnalytics(
    val income: Double,
    val expenses: Double,
    val categoryExpenses: Map<String, Double>
) {
    val net: Double get() = income - expenses

    companion object {
        fun from(items: List<PersonalExpense>): ExpenseAnalytics = ExpenseAnalytics(
            income = items.filter { it.type == "income" }.sumOf { it.amount },
            expenses = items.filter { it.type == "expense" }.sumOf { it.amount },
            categoryExpenses = items
                .filter { it.type == "expense" }
                .groupBy { it.category }
                .mapValues { (_, values) -> values.sumOf { it.amount } }
                .toList()
                .sortedByDescending { it.second }
                .toMap()
        )
    }
}
