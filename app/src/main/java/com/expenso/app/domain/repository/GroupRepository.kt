package com.expenso.app.domain.repository

import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.model.ExpenseSplit

interface GroupRepository {
    suspend fun getUserGroups(userId: String): List<Group>
    suspend fun getGroupById(groupId: String): Group?
    suspend fun createGroup(name: String, description: String?, createdBy: String): String?
    suspend fun updateGroup(groupId: String, name: String, description: String?, imageUrl: String?): Boolean
    suspend fun deleteGroup(groupId: String): Boolean
    suspend fun getGroupMembers(groupId: String): List<GroupMember>
    suspend fun addGroupMember(groupId: String, userEmail: String): Boolean
    suspend fun removeGroupMember(groupId: String, userId: String): Boolean
    suspend fun getGroupExpenses(groupId: String): List<GroupExpense>
    suspend fun addGroupExpense(groupId: String, paidBy: String, title: String, totalAmount: Double, category: String, splitType: String, note: String?, expenseDate: String, splits: List<Pair<String, Double>>): Boolean
    suspend fun deleteGroupExpense(expenseId: String): Boolean
    suspend fun getExpenseSplits(expenseId: String): List<ExpenseSplit>
    suspend fun getGroupBalances(groupId: String, userId: String): List<GroupBalance>
    suspend fun uploadGroupImage(groupId: String, imageBytes: ByteArray, extension: String): String?
}
