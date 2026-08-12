package com.expenso.app.core.util

object Constants {
    // TODO: Replace with your Google Web Client ID from Google Cloud Console
    const val GOOGLE_WEB_CLIENT_ID = "YOUR_GOOGLE_WEB_CLIENT_ID_HERE"

    // Supabase Storage Buckets
    const val AVATARS_BUCKET = "avatars"
    const val GROUP_IMAGES_BUCKET = "group-images"

    // Expense Categories
    val EXPENSE_CATEGORIES = listOf(
        "Food" to "\uD83C\uDF55",         // 🍕
        "Transport" to "\uD83D\uDE97",     // 🚗
        "Shopping" to "\uD83D\uDED2",      // 🛒
        "Entertainment" to "\uD83C\uDFAC", // 🎬
        "Bills" to "\uD83D\uDCA1",         // 💡
        "Health" to "\uD83D\uDC8A",        // 💊
        "Education" to "\uD83D\uDCDA",     // 📚
        "Travel" to "\u2708\uFE0F",         // ✈️
        "Groceries" to "\uD83E\uDD66",     // 🥦
        "Rent" to "\uD83C\uDFE0",          // 🏠
        "Salary" to "\uD83D\uDCBC",        // 💼
        "Freelance" to "\uD83D\uDCBB",     // 💻
        "Other" to "\u2728"                 // ✨
    )
}
