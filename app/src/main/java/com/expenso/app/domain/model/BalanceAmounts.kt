package com.expenso.app.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

fun balanceAtCents(balance: Double): Double =
    BigDecimal.valueOf(balance).setScale(2, RoundingMode.HALF_UP).toDouble()

fun netBalanceAtCents(balances: List<GroupBalance>): Double = balances
    .fold(BigDecimal.ZERO) { sum, balance -> sum + BigDecimal.valueOf(balance.balance) }
    .setScale(2, RoundingMode.HALF_UP)
    .toDouble()
