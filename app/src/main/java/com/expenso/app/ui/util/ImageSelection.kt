package com.expenso.app.ui.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val MAX_INPUT_BYTES = 20L * 1024 * 1024
private const val MAX_OUTPUT_BYTES = 5 * 1024 * 1024
private const val MAX_DIMENSION = 1024

internal fun isSupportedGroupImageMime(mimeType: String?): Boolean =
    mimeType?.lowercase() in setOf("image/jpeg", "image/png", "image/webp")

internal fun calculateInSampleSize(width: Int, height: Int, maxDimension: Int = MAX_DIMENSION): Int {
    var sampleSize = 1
    while (width / sampleSize > maxDimension * 2 || height / sampleSize > maxDimension * 2) {
        sampleSize *= 2
    }
    return sampleSize
}

suspend fun compressSelectedImage(context: Context, uri: Uri): Result<ByteArray> =
    withContext(Dispatchers.IO) {
        runCatching {
            val resolver = context.contentResolver
            require(isSupportedGroupImageMime(resolver.getType(uri))) {
                "Choose a JPEG, PNG, or WebP image"
            }
            resolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                require(descriptor.length < 0 || descriptor.length <= MAX_INPUT_BYTES) {
                    "Image is too large to process"
                }
            }

            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            val boundsStream = resolver.openInputStream(uri) ?: error("Could not read image")
            boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid image file" }

            val options = BitmapFactory.Options().apply {
                inSampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight)
            }
            val original = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            } ?: error("Could not decode image")
            val scale = minOf(
                MAX_DIMENSION.toFloat() / original.width,
                MAX_DIMENSION.toFloat() / original.height,
                1f
            )
            val resized = if (scale < 1f) {
                Bitmap.createScaledBitmap(
                    original,
                    (original.width * scale).toInt(),
                    (original.height * scale).toInt(),
                    true
                )
            } else original
            try {
                ByteArrayOutputStream().use { output ->
                    require(resized.compress(Bitmap.CompressFormat.JPEG, 82, output)) {
                        "Could not compress image"
                    }
                    output.toByteArray().also {
                        require(it.size <= MAX_OUTPUT_BYTES) { "Compressed image exceeds 5 MB" }
                    }
                }
            } finally {
                if (resized !== original) resized.recycle()
                original.recycle()
            }
        }
    }
