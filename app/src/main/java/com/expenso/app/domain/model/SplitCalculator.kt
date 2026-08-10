package com.expenso.app.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

data class SplitPlan(
    val totalAmount: Double,
    val splits: List<Pair<String, Double>>
)

object SplitCalculator {
    private val cent = BigDecimal("0.01")

    fun calculate(
        totalInput: String,
        splitType: String,
        selectedUsers: Collection<String> = emptyList(),
        exactAmounts: Map<String, String> = emptyMap(),
        percentages: Map<String, String> = emptyMap()
    ): SplitPlan {
        val total = totalInput.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)
            ?: throw IllegalArgumentException("Enter a valid amount")
        require(total > BigDecimal.ZERO) { "Amount must be greater than zero" }

        val shares = when (splitType) {
            "equal" -> allocate(total, selectedUsers.distinct().map { it to BigDecimal.ONE })
            "exact" -> exact(total, exactAmounts)
            "percentage" -> percentage(total, percentages)
            else -> throw IllegalArgumentException("Unsupported split type")
        }
        return SplitPlan(total.toDouble(), shares.map { it.first to it.second.toDouble() })
    }

    private fun exact(total: BigDecimal, inputs: Map<String, String>): List<Pair<String, BigDecimal>> {
        val shares = inputs.mapNotNull { (userId, input) ->
            if (input.isBlank()) return@mapNotNull null
            val value = input.toBigDecimalOrNull()
                ?: throw IllegalArgumentException("Enter valid exact amounts")
            if (value < BigDecimal.ZERO) throw IllegalArgumentException("Exact amounts cannot be negative")
            val rounded = value.setScale(2, RoundingMode.HALF_UP)
            if (rounded == BigDecimal.ZERO) null else userId to rounded
        }.sortedBy { it.first }
        require(shares.isNotEmpty()) { "Enter at least one exact amount" }
        require(shares.fold(BigDecimal.ZERO) { sum, share -> sum + share.second } == total) {
            "Exact amounts must equal the total"
        }
        return shares
    }

    private fun percentage(total: BigDecimal, inputs: Map<String, String>): List<Pair<String, BigDecimal>> {
        val weights = inputs.mapNotNull { (userId, input) ->
            if (input.isBlank()) return@mapNotNull null
            val value = input.toBigDecimalOrNull()
                ?: throw IllegalArgumentException("Enter valid percentages")
            if (value < BigDecimal.ZERO) throw IllegalArgumentException("Percentages cannot be negative")
            if (value == BigDecimal.ZERO) null else userId to value
        }
        require(weights.isNotEmpty()) { "Enter at least one percentage" }
        val totalPercent = weights.fold(BigDecimal.ZERO) { sum, weight -> sum + weight.second }
        require(totalPercent.setScale(4, RoundingMode.HALF_UP) == BigDecimal("100.0000")) {
            "Percentages must equal 100"
        }
        return allocate(total, weights)
    }

    private fun allocate(
        total: BigDecimal,
        weights: List<Pair<String, BigDecimal>>
    ): List<Pair<String, BigDecimal>> {
        require(weights.isNotEmpty()) { "Select at least one member" }
        val positiveWeights = weights.filter { it.second > BigDecimal.ZERO }
        require(positiveWeights.isNotEmpty()) { "Select at least one member" }
        val weightTotal = positiveWeights.fold(BigDecimal.ZERO) { sum, weight -> sum + weight.second }
        data class Portion(
            val userId: String,
            val floor: BigDecimal,
            val fraction: BigDecimal
        )
        val portions = positiveWeights.map { (userId, weight) ->
            val raw = total.multiply(weight).divide(weightTotal, 12, RoundingMode.HALF_EVEN)
            val floor = raw.setScale(2, RoundingMode.DOWN)
            Portion(userId, floor, raw - floor)
        }
        val allocated = portions.associate { it.userId to it.floor }.toMutableMap()
        val floorTotal = portions.fold(BigDecimal.ZERO) { sum, portion -> sum + portion.floor }
        val remainingCents = total.subtract(floorTotal).movePointRight(2).intValueExact()
        val remainderOrder = portions.sortedWith(
            compareByDescending<Portion> { it.fraction }.thenBy { it.userId }
        )
        repeat(remainingCents) { index ->
            val userId = remainderOrder[index % remainderOrder.size].userId
            allocated[userId] = allocated.getValue(userId) + cent
        }
        return allocated.entries.sortedBy { it.key }.map { it.key to it.value }
    }
}
