package com.expenso.app.data.repository

import com.expenso.app.data.dto.CreateSettlementDto
import com.expenso.app.data.dto.SettlementDto
import com.expenso.app.data.mapper.toDomain
import com.expenso.app.domain.model.Settlement
import com.expenso.app.domain.repository.SettlementRepository
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SettlementRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest
) : SettlementRepository {

    override suspend fun getGroupSettlements(groupId: String): List<Settlement> {
        return try {
            withContext(Dispatchers.IO) {
                val settlements = postgrest["settlements"].select {
                    filter { eq("group_id", groupId) }
                }.decodeList<SettlementDto>()
                
                settlements.map { it.toDomain() }
            }
        } catch (e: Exception) {
            emptyList()
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
                val dto = CreateSettlementDto(
                    groupId = groupId,
                    payerId = payerId,
                    receiverId = receiverId,
                    amount = amount,
                    status = "pending_confirmation",
                    transactionRef = transactionRef,
                    confirmationToken = UUID.randomUUID().toString()
                )
                postgrest["settlements"].insert(dto)
                true
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
                )
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun rejectSettlement(settlementId: String, userId: String): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                postgrest["settlements"].update(
                    mapOf("status" to "rejected")
                ) {
                    filter { eq("id", settlementId) }
                }
                true
            }
        } catch (e: Exception) {
            false
        }
    }
}
