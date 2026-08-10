package com.expenso.app.core.util

object Constants {
    const val SUPABASE_URL = "https://rspuqbcgjqezimwwpbzl.supabase.co"
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcHVxYmNnanFlemltd3dwYnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDI4OTAsImV4cCI6MjEwMTkxODg5MH0.DpxNbLuq-NzvStb5kw6-hnJB5e28Fz7txHLhLi4zAUQ"
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
