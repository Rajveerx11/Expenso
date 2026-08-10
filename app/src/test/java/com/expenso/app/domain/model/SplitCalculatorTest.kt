package com.expenso.app.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SplitCalculatorTest {
    @Test
    fun `equal split allocates remainder deterministically and reconciles total`() {
        val plan = SplitCalculator.calculate("1.00", "equal", selectedUsers = listOf("c", "a", "b"))
        assertEquals(listOf("a" to 0.34, "b" to 0.33, "c" to 0.33), plan.splits)
        assertEquals(1.0, plan.splits.sumOf { it.second }, 0.001)
    }

    @Test
    fun `equal split excludes unselected members and retains payer share`() {
        val plan = SplitCalculator.calculate(
            "100.00", "equal", selectedUsers = listOf("payer", "included")
        )
        assertEquals(listOf("included" to 50.0, "payer" to 50.0), plan.splits)
        assertEquals(null, plan.splits.toMap()["excluded"])
    }

    @Test
    fun `percentage split assigns rounding cent to greatest fractional remainder`() {
        val plan = SplitCalculator.calculate(
            "10.00",
            "percentage",
            percentages = mapOf("a" to "33.33", "b" to "33.33", "c" to "33.34")
        )
        assertEquals(listOf("a" to 3.33, "b" to 3.33, "c" to 3.34), plan.splits)
    }

    @Test
    fun `exact split rounds inputs to stored cents before validation`() {
        val plan = SplitCalculator.calculate(
            "1.01", "exact", exactAmounts = mapOf("a" to "0.505", "b" to "0.504")
        )
        assertEquals(listOf("a" to 0.51, "b" to 0.50), plan.splits)
    }

    @Test
    fun `invalid exact and percentage totals are rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            SplitCalculator.calculate("10.00", "exact", exactAmounts = mapOf("a" to "9.99"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            SplitCalculator.calculate("10.00", "percentage", percentages = mapOf("a" to "99.99"))
        }
    }

    @Test
    fun `balance helpers hide floating point residue at currency precision`() {
        val balances = listOf(
            GroupBalance("a", "A", null, 0.1),
            GroupBalance("b", "B", null, 0.2),
            GroupBalance("c", "C", null, -0.3)
        )
        assertEquals(0.0, netBalanceAtCents(balances), 0.0)
        assertEquals(0.0, balanceAtCents(0.004), 0.0)
    }
}
