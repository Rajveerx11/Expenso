package com.expenso.app.domain.model

data class User(
    val id: String,
    val email: String,
    val fullName: String,
    val avatarUrl: String? = null,
    val upiId: String? = null,
    val totalIncome: Double = 0.0,
    val totalBalance: Double = 0.0,
    val createdAt: String? = null,
    val updatedAt: String? = null
)
