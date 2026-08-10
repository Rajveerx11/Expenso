package com.expenso.app.domain.model

data class GroupBalance(
    val userId: String,
    val userName: String,
    val userAvatarUrl: String?,
    val balance: Double // positive = owed to this user, negative = this user owes
)
