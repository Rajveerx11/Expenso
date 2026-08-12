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
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put

class GroupRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage
) : GroupRepository {

    override suspend fun getUserGroups(userId: String): List<Group> {
        return withContext(Dispatchers.IO) {
            val currentUserId = auth.currentUserOrNull()?.id
                ?: error("Sign in again to load your groups")
            require(currentUserId == userId) { "Cannot load groups for another user" }

            try {
                postgrest.rpc("list_user_groups")
                    .decodeList<GroupDto>()
                    .map { it.toDomain() }
            } catch (e: Exception) {
                throw IllegalStateException("Could not load groups. Please try again.", e)
            }
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
            auth.currentUserOrNull()?.id ?: error("Sign in again to create a group")
            postgrest.rpc(
                "create_group_with_admin",
                parameters = buildJsonObject {
                    put("name_param", name)
                    description?.let { put("description_param", it) }
                }
            ).decodeSingle<String>()
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
        return try {
            withContext(Dispatchers.IO) {
                postgrest["groups"].delete {
                    filter { eq("id", groupId) }
                }
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getGroupMembers(groupId: String): List<GroupMember> {
        return try {
            withContext(Dispatchers.IO) {
                val members = postgrest["group_members"].select(
                    columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, profiles(*)")
                ) {
                    filter { eq("group_id", groupId) }
                }.decodeList<GroupMemberWithProfileDto>()
                
                members.map { it.toDomain() }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun addGroupMember(groupId: String, userEmail: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                val profile = postgrest["profiles"].select {
                    filter { eq("email", userEmail) }
                }.decodeSingleOrNull<ProfileDto>() ?: return@withContext false
                
                postgrest["group_members"].insert(buildJsonObject {
                    put("group_id", groupId)
                    put("user_id", profile.id)
                    put("role", "editor")
                })
                true
            }
        } catch (e: Exception) {
            android.util.Log.e("GroupRepo", "addGroupMember failed: ${e.message}", e)
            false
        }
    }

    override suspend fun removeGroupMember(groupId: String, userId: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest["group_members"].delete {
                    filter { 
                        eq("group_id", groupId)
                        eq("user_id", userId) 
                    }
                }
                true
            }
        } catch (e: Exception) {
            false
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
                postgrest.rpc(
                    "create_group_expense",
                    parameters = buildJsonObject {
                        put("group_id_param", groupId)
                        put("paid_by_param", paidBy)
                        put("title_param", title)
                        put("total_amount_param", totalAmount)
                        put("category_param", category)
                        put("split_type_param", splitType)
                        put("note_param", note)
                        put("expense_date_param", expenseDate)
                        put("splits_param", buildJsonArray {
                            splits.forEach { (userId, amount) ->
                                add(buildJsonObject {
                                    put("user_id", userId)
                                    put("owed_amount", amount)
                                })
                            }
                        })
                    }
                )
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
                postgrest.rpc(
                    "delete_group_expense",
                    parameters = buildJsonObject { put("expense_id_param", expenseId) }
                )
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
        return try {
            withContext(Dispatchers.IO) {
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
        } catch (e: Exception) {
            emptyList()
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
                bucket.upload(fileName, imageBytes)
                bucket.publicUrl(fileName)
            }
        } catch (e: Exception) {
            null
        }
    }
}
