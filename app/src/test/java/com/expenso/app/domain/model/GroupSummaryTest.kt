package com.expenso.app.domain.model

import org.junit.Assert.assertEquals
import org.junit.Test

class GroupSummaryTest {
    @Test
    fun `summary uses loaded member count and caller-relative balances`() {
        val group = Group("group", "Trip", null, null, "owner", "INR", true, "", "")
        val members = listOf(
            GroupMember("1", "group", "owner", "admin", ""),
            GroupMember("2", "group", "friend-a", "editor", ""),
            GroupMember("3", "group", "friend-b", "editor", "")
        )
        val balances = listOf(
            GroupBalance("friend-a", "A", null, 25.25),
            GroupBalance("friend-b", "B", null, -10.0)
        )

        val summary = group.withSummary(members, balances)

        assertEquals(3, summary.memberCount)
        assertEquals(15.25, summary.currentUserBalance, 0.001)
    }

    @Test
    fun `summary rounds floating point residue to stored cents`() {
        val group = Group("group", "Trip", null, null, "owner", "INR", true, "", "")
        val balances = listOf(
            GroupBalance("a", "A", null, 0.1),
            GroupBalance("b", "B", null, 0.2),
            GroupBalance("c", "C", null, -0.3)
        )
        assertEquals(0.0, group.withSummary(emptyList(), balances).currentUserBalance, 0.0)
    }
}
