package com.expenso.app.data.repository

import com.expenso.app.data.dto.CreatePersonalExpenseDto
import com.expenso.app.data.dto.PersonalExpenseDto
import com.expenso.app.data.dto.UpdatePersonalExpenseDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.repository.ExpenseRepository
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ExpenseRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest
) : ExpenseRepository {

    override suspend fun getPersonalExpenses(userId: String): List<PersonalExpense> {
        return try {
            withContext(Dispatchers.IO) {
                val response = postgrest["personal_expenses"]
                    .select {
                        filter {
                            eq("user_id", userId)
                        }
                    }
                    .decodeList<PersonalExpenseDto>()
                response.map { it.toDomain() }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getPersonalExpensesByMonth(
        userId: String,
        year: Int,
        month: Int
    ): List<PersonalExpense> {
        return try {
            withContext(Dispatchers.IO) {
                val monthOneBased = month + 1
                val startDate = String.format("%04d-%02d-01", year, monthOneBased)
                val endDate = if (monthOneBased == 12) {
                    String.format("%04d-%02d-01", year + 1, 1)
                } else {
                    String.format("%04d-%02d-01", year, monthOneBased + 1)
                }
                
                val response = postgrest["personal_expenses"]
                    .select {
                        filter {
                            eq("user_id", userId)
                            gte("expense_date", startDate)
                            lt("expense_date", endDate)
                        }
                    }
                    .decodeList<PersonalExpenseDto>()
                response.map { it.toDomain() }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun addPersonalExpense(
        userId: String,
        title: String,
        amount: Double,
        category: String,
        type: String,
        note: String?,
        expenseDate: String
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val dto = CreatePersonalExpenseDto(
                    userId = userId,
                    title = title,
                    amount = amount,
                    category = category,
                    type = type,
                    note = note,
                    expenseDate = expenseDate
                )
                postgrest["personal_expenses"].insert(dto)
                // Insert succeeded — this is the critical part
                // Try RPC but don't fail if it doesn't exist
                try {
                    postgrest.rpc("recalculate_balance", parameters = buildJsonObject { put("user_id_param", userId) })
                } catch (_: Exception) {
                    // RPC may not exist yet, that's ok — expense was still saved
                }
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    override suspend fun updatePersonalExpense(
        expenseId: String,
        title: String,
        amount: Double,
        category: String,
        type: String,
        note: String?,
        expenseDate: String
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val dto = UpdatePersonalExpenseDto(
                    title = title,
                    amount = amount,
                    category = category,
                    type = type,
                    note = note,
                    expenseDate = expenseDate
                )
                
                val expense = postgrest["personal_expenses"].select {
                    filter { eq("id", expenseId) }
                }.decodeSingle<PersonalExpenseDto>()
                
                postgrest["personal_expenses"].update(dto) {
                    filter {
                        eq("id", expenseId)
                    }
                }
                
                try {
                    postgrest.rpc("recalculate_balance", parameters = buildJsonObject { put("user_id_param", expense.userId) })
                } catch (_: Exception) {}
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    override suspend fun deletePersonalExpense(expenseId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val expense = postgrest["personal_expenses"].select {
                    filter { eq("id", expenseId) }
                }.decodeSingle<PersonalExpenseDto>()
                
                postgrest["personal_expenses"].delete {
                    filter {
                        eq("id", expenseId)
                    }
                }
                
                try {
                    postgrest.rpc("recalculate_balance", parameters = buildJsonObject { put("user_id_param", expense.userId) })
                } catch (_: Exception) {}
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    override suspend fun getMonthlyTotal(
        userId: String,
        year: Int,
        month: Int,
        type: String
    ): Double {
        return try {
            withContext(Dispatchers.IO) {
                val monthOneBased = month + 1
                val startDate = String.format("%04d-%02d-01", year, monthOneBased)
                val endDate = if (monthOneBased == 12) {
                    String.format("%04d-%02d-01", year + 1, 1)
                } else {
                    String.format("%04d-%02d-01", year, monthOneBased + 1)
                }
                
                val expenses = postgrest["personal_expenses"]
                    .select {
                        filter {
                            eq("user_id", userId)
                            eq("type", type)
                            gte("expense_date", startDate)
                            lt("expense_date", endDate)
                        }
                    }
                    .decodeList<PersonalExpenseDto>()
                    
                expenses.sumOf { it.amount }
            }
        } catch (e: Exception) {
            0.0
        }
    }
}
