package com.expenso.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.expenso.app.ui.theme.DeepIndigo
import com.expenso.app.ui.theme.GlassBorder
import com.expenso.app.ui.theme.LightestIndigo

@Composable
fun AvatarImage(
    imageUrl: String?,
    name: String,
    size: Dp = 48.dp,
    modifier: Modifier = Modifier
) {
    if (!imageUrl.isNullOrBlank()) {
        AsyncImage(
            model = imageUrl,
            contentDescription = "$name's avatar",
            modifier = modifier
                .size(size)
                .clip(CircleShape)
                .border(2.dp, GlassBorder, CircleShape),
            contentScale = ContentScale.Crop
        )
    } else {
        val initials = name.split(" ")
            .take(2)
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .joinToString("")
        Box(
            modifier = modifier
                .size(size)
                .clip(CircleShape)
                .background(LightestIndigo)
                .border(2.dp, GlassBorder, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = if (initials.isBlank()) "U" else initials,
                color = DeepIndigo,
                fontWeight = FontWeight.Bold,
                fontSize = (size.value / 2.5).sp
            )
        }
    }
}
