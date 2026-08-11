package com.expenso.app.ui.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageSelectionTest {
    @Test
    fun `only supported image mime types are accepted`() {
        assertTrue(isSupportedGroupImageMime("image/jpeg"))
        assertTrue(isSupportedGroupImageMime("image/png"))
        assertTrue(isSupportedGroupImageMime("image/webp"))
        assertFalse(isSupportedGroupImageMime("image/svg+xml"))
        assertFalse(isSupportedGroupImageMime(null))
    }

    @Test
    fun `large image bounds choose power of two sampling`() {
        assertEquals(1, calculateInSampleSize(1200, 800))
        assertEquals(4, calculateInSampleSize(8000, 6000))
    }
}
