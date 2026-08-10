package com.expenso.app.domain.repository

import com.expenso.app.domain.model.Settlement

interface SettlementRepository {
    suspend fun getGroupSettlements(groupId: String): List<Settlement>
    suspend fun createSettlement(groupId: String, payerId: String, receiverId: String, amount: Double, transactionRef: String?): Boolean
    suspend fun confirmSettlement(settlementId: String, userId: String): Boolean
    suspend fun rejectSettlement(settlementId: String, userId: String): Boolean
}
