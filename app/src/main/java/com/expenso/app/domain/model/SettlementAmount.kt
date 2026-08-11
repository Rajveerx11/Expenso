package com.expenso.app.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

fun validatedSettlementAmount(input: String, maxOutstanding: Double): Double {
    val amount = input.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)
        ?: throw IllegalArgumentException("Enter a valid settlement amount")
    val maximum = BigDecimal.valueOf(maxOutstanding).setScale(2, RoundingMode.HALF_UP)
    require(amount > BigDecimal.ZERO) { "Settlement amount must be greater than zero" }
    require(amount <= maximum) { "Settlement cannot exceed the outstanding balance" }
    return amount.toDouble()
}
