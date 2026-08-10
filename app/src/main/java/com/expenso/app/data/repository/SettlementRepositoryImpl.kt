package com.expenso.app.data.repository

import com.expenso.app.data.dto.SettlementDto
import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.Settlement
import com.expenso.app.domain.repository.SettlementRepository
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SettlementRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest
) : SettlementRepository {

    override suspend fun getGroupSettlements(groupId: String): List<Settlement> {
        return withContext(Dispatchers.IO) {
                val settlements = postgrest["settlements"].select {
                    filter { eq("group_id", groupId) }
                }.decodeList<SettlementDto>()
                if (settlements.isEmpty()) return@withContext emptyList()
                val userIds = settlements.flatMap { listOf(it.payerId, it.receiverId) }.distinct()
                val profiles = postgrest["profiles"].select {
                    filter { isIn("id", userIds) }
                }.decodeList<ProfileDto>().associateBy { it.id }
                settlements.map { dto ->
                    dto.toDomain().copy(
                        payerName = profiles[dto.payerId]?.fullName ?: "Unknown",
                        receiverName = profiles[dto.receiverId]?.fullName ?: "Unknown"
                    )
                }.sortedByDescending { it.createdAt }
        }
    }

    override suspend fun createSettlement(
        groupId: String,
        payerId: String,
        receiverId: String,
        amount: Double,
        transactionRef: String?
    ): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest.rpc(
                    "create_settlement",
                    parameters = buildJsonObject {
                        put("group_id_param", groupId)
                        put("receiver_id_param", receiverId)
                        put("amount_param", amount)
                        put("transaction_ref_param", transactionRef)
                    }
                ).decodeAs<String>().isNotBlank()
            }
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun confirmSettlement(settlementId: String, userId: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest.rpc(
                    "confirm_settlement", 
                    parameters = buildJsonObject {
                        put("settlement_id_param", settlementId)
                        put("user_id_param", userId)
                    }
                ).decodeAs<Boolean>()
            }
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun rejectSettlement(settlementId: String, userId: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest.rpc(
                    "reject_settlement",
                    parameters = buildJsonObject { put("settlement_id_param", settlementId) }
                ).decodeAs<Boolean>()
            }
        } catch (e: Exception) {
            false
        }
    }
}
