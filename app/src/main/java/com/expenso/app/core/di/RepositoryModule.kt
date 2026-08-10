package com.expenso.app.core.di

import com.expenso.app.data.repository.AuthRepositoryImpl
import com.expenso.app.data.repository.ProfileRepositoryImpl
import com.expenso.app.data.repository.ExpenseRepositoryImpl
import com.expenso.app.data.repository.GroupRepositoryImpl
import com.expenso.app.data.repository.SettlementRepositoryImpl
import com.expenso.app.domain.repository.AuthRepository
import com.expenso.app.domain.repository.ProfileRepository
import com.expenso.app.domain.repository.ExpenseRepository
import com.expenso.app.domain.repository.GroupRepository
import com.expenso.app.domain.repository.SettlementRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindProfileRepository(impl: ProfileRepositoryImpl): ProfileRepository

    @Binds
    @Singleton
    abstract fun bindExpenseRepository(impl: ExpenseRepositoryImpl): ExpenseRepository

    @Binds
    @Singleton
    abstract fun bindGroupRepository(impl: GroupRepositoryImpl): GroupRepository

    @Binds
    @Singleton
    abstract fun bindSettlementRepository(impl: SettlementRepositoryImpl): SettlementRepository
}
