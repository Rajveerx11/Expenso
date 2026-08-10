package com.expenso.app.domain.repository

import com.expenso.app.domain.model.PersonalExpense

interface ExpenseRepository {
    suspend fun getPersonalExpenses(userId: String): List<PersonalExpense>
    suspend fun getPersonalExpensesByMonth(userId: String, year: Int, month: Int): List<PersonalExpense>
    suspend fun addPersonalExpense(userId: String, title: String, amount: Double, category: String, type: String, note: String?, expenseDate: String): Boolean
    suspend fun updatePersonalExpense(expenseId: String, title: String, amount: Double, category: String, type: String, note: String?, expenseDate: String): Boolean
    suspend fun deletePersonalExpense(expenseId: String): Boolean
    suspend fun getMonthlyTotal(userId: String, year: Int, month: Int, type: String): Double
}
