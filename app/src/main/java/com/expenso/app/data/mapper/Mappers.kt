package com.expenso.app.data.mapper

import com.expenso.app.data.dto.ProfileDto
import com.expenso.app.data.dto.PersonalExpenseDto
import com.expenso.app.data.dto.GroupDto
import com.expenso.app.data.dto.GroupMemberWithProfileDto
import com.expenso.app.data.dto.GroupExpenseDto
import com.expenso.app.data.dto.ExpenseSplitDto
import com.expenso.app.data.dto.SettlementDto
import com.expenso.app.domain.model.User
import com.expenso.app.domain.model.PersonalExpense
import com.expenso.app.domain.model.Group
import com.expenso.app.domain.model.GroupMember
import com.expenso.app.domain.model.GroupExpense
import com.expenso.app.domain.model.ExpenseSplit
import com.expenso.app.domain.model.Settlement

fun ProfileDto.toDomain(): User {
    return User(
        id = id,
        email = email,
        fullName = fullName,
        avatarUrl = avatarUrl,
        upiId = upiId,
        totalIncome = totalIncome,
        totalBalance = totalBalance,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

fun PersonalExpenseDto.toDomain(): PersonalExpense {
    return PersonalExpense(
        id = id,
        userId = userId,
        title = title,
        amount = amount,
        category = category,
        type = type,
        note = note,
        sourceGroupExpenseId = sourceGroupExpenseId,
        expenseDate = expenseDate,
        createdAt = createdAt
    )
}

fun GroupDto.toDomain(): Group {
    return Group(
        id = id,
        name = name,
        description = description,
        imageUrl = imageUrl,
        createdBy = createdBy,
        defaultCurrency = defaultCurrency,
        simplifiedDebts = simplifiedDebts,
        createdAt = createdAt,
        updatedAt = updatedAt
    )
}

fun GroupMemberWithProfileDto.toDomain(): GroupMember {
    return GroupMember(
        id = id,
        groupId = groupId,
        userId = userId,
        role = role,
        joinedAt = joinedAt,
        userName = profile?.fullName ?: "",
        userEmail = profile?.email ?: "",
        userAvatarUrl = profile?.avatarUrl
    )
}

fun GroupExpenseDto.toDomain(): GroupExpense {
    return GroupExpense(
        id = id,
        groupId = groupId,
        paidBy = paidBy,
        paidByName = "", // Filled later if needed
        title = title,
        totalAmount = totalAmount,
        category = category,
        splitType = splitType,
        note = note,
        expenseDate = expenseDate,
        createdAt = createdAt
    )
}

fun ExpenseSplitDto.toDomain(): ExpenseSplit {
    return ExpenseSplit(
        id = id,
        expenseId = expenseId,
        userId = userId,
        userName = "", // Filled later if needed
        owedAmount = owedAmount,
        isSettled = isSettled,
        settledAt = settledAt
    )
}

fun SettlementDto.toDomain(): Settlement {
    return Settlement(
        id = id,
        groupId = groupId,
        payerId = payerId,
        payerName = "", // Filled later
        receiverId = receiverId,
        receiverName = "", // Filled later
        amount = amount,
        status = status,
        transactionRef = transactionRef,
        createdAt = createdAt,
        confirmedAt = confirmedAt
    )
}
