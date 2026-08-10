package com.expenso.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.expenso.app.ui.theme.EmeraldGreen
import com.expenso.app.ui.theme.GradientMiddle
import com.expenso.app.ui.theme.GradientStart
import com.expenso.app.ui.theme.NeutralMedium
import com.expenso.app.ui.theme.RoseRed

@Composable
fun GroupCard(
    name: String,
    memberCount: Int,
    imageUrl: String?,
    balance: Double,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier.fillMaxWidth().clickable(onClick = onClick)) {
        GlassCard(
            modifier = Modifier.fillMaxWidth()
        ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Group Image or Placeholder
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(GradientStart, GradientMiddle))),
                contentAlignment = Alignment.Center
            ) {
                if (!imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = "Group Image",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.Group,
                        contentDescription = "Group",
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Group Name and Members
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "$memberCount members",
                    style = MaterialTheme.typography.bodySmall,
                    color = NeutralMedium
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Balance Indicator
            Column(horizontalAlignment = Alignment.End) {
                if (balance != 0.0) {
                    val isOwedToYou = balance > 0
                    Text(
                        text = if (isOwedToYou) "you are owed" else "you owe",
                        style = MaterialTheme.typography.labelSmall,
                        color = NeutralMedium
                    )
                    Text(
                        text = "₹${Math.abs(balance)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (isOwedToYou) EmeraldGreen else RoseRed
                    )
                } else {
                    Text(
                        text = "settled up",
                        style = MaterialTheme.typography.labelMedium,
                        color = NeutralMedium
                    )
                }
            }
        }
        }
    }
}
