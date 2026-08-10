package com.expenso.app.data.repository

import com.expenso.app.data.dto.GroupDto
import com.expenso.app.data.dto.GroupMemberWithProfileDto
import com.expenso.app.data.dto.GroupExpenseDto
import com.expenso.app.data.dto.ExpenseSplitDto
import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupBalance
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.model.ExpenseSplit
import com.expenso.app.domain.repository.GroupRepository
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class GroupRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val storage: Storage
) : GroupRepository {

    override suspend fun getUserGroups(userId: String): List<Group> {
        return withContext(Dispatchers.IO) {
            val memberDtos = postgrest["group_members"].select {
                filter { eq("user_id", userId) }
            }.decodeList<com.expenso.app.data.dto.GroupMemberDto>()
            val groupIdsFromMembers = memberDtos.map { it.groupId }
            val createdGroups = postgrest["groups"].select {
                filter { eq("created_by", userId) }
            }.decodeList<GroupDto>()
            val memberGroups = if (groupIdsFromMembers.isEmpty()) emptyList() else {
                postgrest["groups"].select {
                    filter { isIn("id", groupIdsFromMembers) }
                }.decodeList<GroupDto>()
            }
            (memberGroups + createdGroups).distinctBy { it.id }.map { it.toDomain() }
        }
    }

    override suspend fun getGroupById(groupId: String): Group? {
        return try {
            withContext(Dispatchers.IO) {
                val group = postgrest["groups"].select {
                    filter { eq("id", groupId) }
                }.decodeSingleOrNull<GroupDto>()
                
                group?.toDomain()
            }
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun createGroup(
        name: String,
        description: String?
    ): String? {
        return withContext(Dispatchers.IO) {
            try {
                postgrest.rpc(
                    "create_group_with_admin",
                    parameters = buildJsonObject {
                        put("name_param", name)
                        put("description_param", description)
                    }
                ).decodeAs<String>()
            } catch (e: Exception) {
                throw IllegalStateException(e.message ?: "Could not create group", e)
            }
        }
    }

    override suspend fun updateGroup(
        groupId: String,
        name: String,
        description: String?,
        imageUrl: String?
    ): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest["groups"].update(buildJsonObject {
                    put("name", name)
                    if (description != null) put("description", description)
                    if (imageUrl != null) put("image_url", imageUrl)
                }) {
                    filter { eq("id", groupId) }
                }
                true
            }
        } catch (e: Exception) {
            android.util.Log.e("GroupRepo", "updateGroup failed: ${e.message}", e)
            false
        }
    }

    override suspend fun deleteGroup(groupId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                postgrest.rpc(
                    "can_delete_group_safely",
                    parameters = buildJsonObject { put("group_id_param", groupId) }
                )
                storage["group-images"].delete("$groupId.jpg")
                postgrest.rpc(
                    "delete_group_safely",
                    parameters = buildJsonObject { put("group_id_param", groupId) }
                )
                true
            } catch (e: Exception) {
                throw IllegalStateException(e.message ?: "Could not delete group", e)
            }
        }
    }

    override suspend fun getGroupMembers(groupId: String): List<GroupMember> {
        return withContext(Dispatchers.IO) {
            postgrest["group_members"].select(
                columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, profiles(*)")
            ) {
                filter { eq("group_id", groupId) }
            }.decodeList<GroupMemberWithProfileDto>().map { it.toDomain() }
        }
    }

    override suspend fun addGroupMember(groupId: String, userEmail: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                postgrest.rpc(
                    "add_group_member_by_email",
                    parameters = buildJsonObject {
                        put("group_id_param", groupId)
                        put("email_param", userEmail)
                    }
                )
                true
            } catch (e: Exception) {
                throw IllegalStateException(e.message ?: "Could not add member", e)
            }
        }
    }

    override suspend fun removeGroupMember(groupId: String, userId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                postgrest.rpc(
                    "remove_group_member_safely",
                    parameters = buildJsonObject {
                        put("group_id_param", groupId)
                        put("member_id_param", userId)
                    }
                )
                true
            } catch (e: Exception) {
                throw IllegalStateException(e.message ?: "Could not remove member", e)
            }
        }
    }

    override suspend fun getGroupExpenses(groupId: String): List<GroupExpense> {
        return try {
            withContext(Dispatchers.IO) {
                val expenses = postgrest["group_expenses"].select {
                    filter { eq("group_id", groupId) }
                }.decodeList<GroupExpenseDto>()
                
                if (expenses.isEmpty()) return@withContext emptyList()
                
                val userIds = expenses.map { it.paidBy }.distinct()
                val profiles = postgrest["profiles"].select {
                    filter { isIn("id", userIds) }
                }.decodeList<ProfileDto>().associateBy { it.id }
                
                expenses.map { 
                    it.toDomain().copy(paidByName = profiles[it.paidBy]?.fullName ?: "Unknown")
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun addGroupExpense(
        groupId: String,
        paidBy: String,
        title: String,
        totalAmount: Double,
        category: String,
        splitType: String,
        note: String?,
        expenseDate: String,
        splits: List<Pair<String, Double>>
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val expenseId = java.util.UUID.randomUUID().toString()
                
                // Insert group expense
                postgrest["group_expenses"].insert(buildJsonObject {
                    put("id", expenseId)
                    put("group_id", groupId)
                    put("paid_by", paidBy)
                    put("title", title)
                    put("total_amount", totalAmount)
                    put("category", category)
                    put("split_type", splitType)
                    if (note != null) put("note", note)
                    put("expense_date", expenseDate)
                })
                
                // Insert splits
                val splitJsonArray = splits.map { (userId, amount) ->
                    buildJsonObject {
                        put("expense_id", expenseId)
                        put("user_id", userId)
                        put("owed_amount", amount)
                        put("is_settled", userId == paidBy)
                    }
                }
                
                // Insert each split separately to avoid array serialization issues
                splitJsonArray.forEach { splitJson ->
                    postgrest["expense_splits"].insert(splitJson)
                }
                
                true
            } catch (e: Exception) {
                android.util.Log.e("GroupRepo", "addGroupExpense failed: ${e.message}", e)
                false
            }
        }
    }

    override suspend fun deleteGroupExpense(expenseId: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest["group_expenses"].delete {
                    filter { eq("id", expenseId) }
                }
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getExpenseSplits(expenseId: String): List<ExpenseSplit> {
        return try {
            withContext(Dispatchers.IO) {
                val splits = postgrest["expense_splits"].select {
                    filter { eq("expense_id", expenseId) }
                }.decodeList<ExpenseSplitDto>()
                
                if (splits.isEmpty()) return@withContext emptyList()
                
                val userIds = splits.map { it.userId }.distinct()
                val profiles = postgrest["profiles"].select {
                    filter { isIn("id", userIds) }
                }.decodeList<ProfileDto>().associateBy { it.id }
                
                splits.map { 
                    it.toDomain().copy(userName = profiles[it.userId]?.fullName ?: "Unknown")
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getGroupBalances(groupId: String, userId: String): List<GroupBalance> {
        return withContext(Dispatchers.IO) {
                @Serializable
                data class RpcBalance(
                    @SerialName("user_id") val userId: String,
                    @SerialName("balance") val balance: Double
                )
                
                val balances = postgrest.rpc(
                    "get_group_balances",
                    parameters = buildJsonObject { put("group_id_param", groupId) }
                ).decodeList<RpcBalance>()
                
                if (balances.isEmpty()) return@withContext emptyList()
                
                val userIds = balances.map { it.userId }
                val profiles = postgrest["profiles"].select {
                    filter { isIn("id", userIds) }
                }.decodeList<ProfileDto>().associateBy { it.id }
                
                balances.map {
                    val profile = profiles[it.userId]
                    GroupBalance(
                        userId = it.userId,
                        userName = profile?.fullName ?: "Unknown",
                        userAvatarUrl = profile?.avatarUrl,
                        balance = it.balance
                    )
                }
        }
    }

    override suspend fun uploadGroupImage(
        groupId: String,
        imageBytes: ByteArray,
        extension: String
    ): String? {
        return try {
            withContext(Dispatchers.IO) {
                val fileName = "$groupId.$extension"
                val bucket = storage["group-images"]
                bucket.upload(fileName, imageBytes) { upsert = true }
                "${bucket.publicUrl(fileName)}?v=${System.currentTimeMillis()}"
            }
        } catch (e: Exception) {
            null
        }
    }
}
