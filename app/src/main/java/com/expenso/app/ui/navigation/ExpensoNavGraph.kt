package com.expenso.app.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.expenso.app.ui.components.BottomNavBar
import com.expenso.app.ui.screen.auth.LoginScreen
import com.expenso.app.ui.screen.auth.OnboardingScreen
import com.expenso.app.ui.screen.auth.SignUpScreen
import com.expenso.app.ui.screen.expenses.AddExpenseScreen
import com.expenso.app.ui.screen.expenses.ExpenseListScreen
import com.expenso.app.ui.screen.groups.AddGroupExpenseScreen
import com.expenso.app.ui.screen.groups.CreateGroupScreen
import com.expenso.app.ui.screen.groups.GroupDetailScreen
import com.expenso.app.ui.screen.groups.GroupListScreen
import com.expenso.app.ui.screen.groups.GroupSettingsScreen
import com.expenso.app.ui.screen.home.HomeScreen
import com.expenso.app.ui.screen.profile.EditProfileScreen
import com.expenso.app.ui.screen.profile.ProfileScreen
import com.expenso.app.ui.screen.settlement.SettlementScreen
import com.expenso.app.ui.screen.settlement.SettlementConfirmationScreen
import com.expenso.app.ui.screen.notifications.NotificationScreen
import com.expenso.app.core.notification.NotificationRoute
import com.expenso.app.ui.screen.splash.SplashScreen

private val bottomNavRoutes = BottomNavItem.entries.map { it.route }

@Composable
fun ExpensoNavGraph(
    navController: NavHostController = rememberNavController(),
    pendingDeepLink: String? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val showBottomBar = currentRoute in bottomNavRoutes

    LaunchedEffect(pendingDeepLink, currentRoute) {
        val isAuthRoute = currentRoute in setOf(
            Screen.Splash.route,
            Screen.Login.route,
            Screen.SignUp.route
        )
        if (pendingDeepLink != null && currentRoute != null && !isAuthRoute) {
            val route = NotificationRoute.toAppRoute(pendingDeepLink)
            onDeepLinkConsumed()
            route?.let { navController.navigate(it) { launchSingleTop = true } }
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                BottomNavBar(
                    selectedRoute = currentRoute ?: Screen.Home.route,
                    onItemSelected = { item ->
                        navController.navigate(item.route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Screen.Splash.route,
            modifier = Modifier.padding(paddingValues),
            enterTransition = {
                fadeIn(animationSpec = tween(300)) + slideIntoContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.Start,
                    animationSpec = tween(300)
                )
            },
            exitTransition = {
                fadeOut(animationSpec = tween(300)) + slideOutOfContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.Start,
                    animationSpec = tween(300)
                )
            },
            popEnterTransition = {
                fadeIn(animationSpec = tween(300)) + slideIntoContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.End,
                    animationSpec = tween(300)
                )
            },
            popExitTransition = {
                fadeOut(animationSpec = tween(300)) + slideOutOfContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.End,
                    animationSpec = tween(300)
                )
            }
        ) {
            // ─── Auth Flow ─────────────────────────────────────
            composable(Screen.Splash.route) {
                SplashScreen(
                    onNavigateToLogin = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.Splash.route) { inclusive = true }
                        }
                    },
                    onNavigateToOnboarding = {
                        navController.navigate(Screen.Onboarding.route) {
                            popUpTo(Screen.Splash.route) { inclusive = true }
                        }
                    },
                    onNavigateToHome = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Splash.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = { needsOnboarding ->
                        navController.navigate(
                            if (needsOnboarding) Screen.Onboarding.route else Screen.Home.route
                        ) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onNavigateToSignUp = {
                        navController.navigate(Screen.SignUp.route)
                    }
                )
            }

            composable(Screen.SignUp.route) {
                SignUpScreen(
                    onSignUpSuccess = { needsOnboarding ->
                        navController.navigate(
                            if (needsOnboarding) Screen.Onboarding.route else Screen.Home.route
                        ) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onNavigateToLogin = {
                        navController.popBackStack()
                    }
                )
            }

            // ─── Main Tabs ─────────────────────────────────────
            composable(Screen.Onboarding.route) {
                OnboardingScreen(
                    onComplete = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Onboarding.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(
                    onNavigateToAddExpense = { type ->
                        navController.navigate(Screen.AddExpense.route + "?type=$type")
                    },
                    onNavigateToExpenses = {
                        navController.navigate(Screen.Expenses.route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    onNavigateToCreateGroup = {
                        navController.navigate(Screen.CreateGroup.route)
                    }
                )
            }

            composable(Screen.Expenses.route) {
                ExpenseListScreen(
                    onNavigateToAddExpense = {
                        navController.navigate(Screen.AddExpense.route)
                    }
                )
            }

            composable(Screen.Groups.route) {
                GroupListScreen(
                    onNavigateToCreateGroup = {
                        navController.navigate(Screen.CreateGroup.route)
                    },
                    onNavigateToGroupDetail = { groupId ->
                        navController.navigate(Screen.GroupDetail.createRoute(groupId))
                    }
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    onNavigateToEditProfile = {
                        navController.navigate(Screen.EditProfile.route)
                    },
                    onNavigateToNotifications = {
                        navController.navigate(Screen.Notifications.route)
                    },
                    onSignOut = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            // ─── Expense Sub-screens ────────────────────────────
            composable(
                route = Screen.AddExpense.route + "?type={type}",
                arguments = listOf(
                    navArgument("type") {
                        type = NavType.StringType
                        defaultValue = "expense"
                    }
                )
            ) {
                AddExpenseScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            composable(Screen.AddExpense.route) {
                AddExpenseScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // ─── Profile Sub-screens ────────────────────────────
            composable(Screen.EditProfile.route) {
                EditProfileScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Notifications.route) {
                NotificationScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onOpenNotification = { notification ->
                        navController.navigate(NotificationRoute.forNotification(notification))
                    }
                )
            }

            // ─── Group Sub-screens ──────────────────────────────
            composable(Screen.CreateGroup.route) {
                CreateGroupScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.GroupDetail.route,
                arguments = listOf(navArgument("groupId") { type = NavType.StringType })
            ) {
                GroupDetailScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToGroupSettings = { groupId ->
                        navController.navigate(Screen.GroupSettings.createRoute(groupId))
                    },
                    onNavigateToAddGroupExpense = { groupId ->
                        navController.navigate(Screen.AddGroupExpense.createRoute(groupId))
                    },
                    onNavigateToSettleUp = { groupId, receiverId ->
                        navController.navigate(Screen.SettleUp.createRoute(groupId, receiverId))
                    }
                )
            }

            composable(
                route = Screen.GroupSettings.route,
                arguments = listOf(navArgument("groupId") { type = NavType.StringType })
            ) {
                GroupSettingsScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onGroupDeleted = {
                        navController.popBackStack(Screen.Groups.route, false)
                    }
                )
            }

            composable(
                route = Screen.AddGroupExpense.route,
                arguments = listOf(navArgument("groupId") { type = NavType.StringType })
            ) {
                AddGroupExpenseScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.SettleUp.route,
                arguments = listOf(
                    navArgument("groupId") { type = NavType.StringType },
                    navArgument("receiverId") { type = NavType.StringType }
                )
            ) {
                SettlementScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }


            composable(
                route = Screen.SettlementConfirmation.route,
                arguments = listOf(
                    navArgument("groupId") { type = NavType.StringType },
                    navArgument("settlementId") { type = NavType.StringType }
                )
            ) {
                SettlementConfirmationScreen(
                    onNavigateBack = { navController.popBackStack() }
                )
            }
        }
    }
}
