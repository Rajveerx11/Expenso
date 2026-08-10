package com.expenso.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Receipt
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Person
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String) {
    // Auth flow
    object Splash : Screen("splash")
    object Login : Screen("login")
    object SignUp : Screen("signup")
    object Onboarding : Screen("onboarding")
    
    // Main tabs
    object Home : Screen("home")
    object Expenses : Screen("expenses")
    object Groups : Screen("groups")
    object Profile : Screen("profile")
    
    // Expense sub-screens
    object AddExpense : Screen("add_expense")
    object EditExpense : Screen("edit_expense/{expenseId}") {
        fun createRoute(expenseId: String) = "edit_expense/$expenseId"
    }
    
    // Group sub-screens
    object CreateGroup : Screen("create_group")
    object GroupDetail : Screen("group_detail/{groupId}") {
        fun createRoute(groupId: String) = "group_detail/$groupId"
    }
    object GroupSettings : Screen("group_settings/{groupId}") {
        fun createRoute(groupId: String) = "group_settings/$groupId"
    }
    object AddGroupExpense : Screen("add_group_expense/{groupId}") {
        fun createRoute(groupId: String) = "add_group_expense/$groupId"
    }
    object SettleUp : Screen("settle_up/{groupId}/{receiverId}") {
        fun createRoute(groupId: String, receiverId: String) = "settle_up/$groupId/$receiverId"
    }
    
    // Profile sub-screens  
    object EditProfile : Screen("edit_profile")
}

enum class BottomNavItem(
    val route: String,
    val icon: ImageVector,
    val label: String
) {
    HOME("home", Icons.Rounded.Home, "Home"),
    EXPENSES("expenses", Icons.Rounded.Receipt, "Expenses"),
    GROUPS("groups", Icons.Rounded.Group, "Groups"),
    PROFILE("profile", Icons.Rounded.Person, "Profile")
}
