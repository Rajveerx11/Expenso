package com.expenso.app.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

fun Group.withSummary(
    members: List<GroupMember>,
    balances: List<GroupBalance>
): Group = copy(
    memberCount = members.size,
    currentUserBalance = balances
        .fold(BigDecimal.ZERO) { sum, balance -> sum + BigDecimal.valueOf(balance.balance) }
        .setScale(2, RoundingMode.HALF_UP)
        .toDouble()
)
