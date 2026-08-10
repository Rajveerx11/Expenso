package com.expenso.app.domain.model

data class Group(
    val id: String,
    val name: String,
    val description: String?,
    val imageUrl: String?,
    val createdBy: String,
    val defaultCurrency: String,
    val simplifiedDebts: Boolean,
    val createdAt: String,
    val updatedAt: String,
    val memberCount: Int = 0
)
