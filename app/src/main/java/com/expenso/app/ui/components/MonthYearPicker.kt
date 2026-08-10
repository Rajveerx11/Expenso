package com.expenso.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.with
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.expenso.app.ui.theme.DeepIndigo
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun MonthYearPicker(
    currentMonth: Int,
    currentYear: Int,
    onMonthChanged: (Int, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    var slideDirection by remember { mutableStateOf(1) } // 1 for right, -1 for left

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = {
                slideDirection = -1
                if (currentMonth == 0) {
                    onMonthChanged(11, currentYear - 1)
                } else {
                    onMonthChanged(currentMonth - 1, currentYear)
                }
            }
        ) {
            Icon(
                imageVector = Icons.Rounded.ChevronLeft,
                contentDescription = "Previous Month",
                tint = DeepIndigo
            )
        }

        AnimatedContent(
            targetState = Pair(currentMonth, currentYear),
            transitionSpec = {
                if (slideDirection > 0) {
                    (slideInHorizontally(animationSpec = tween(300)) { width -> width } + fadeIn()).with(
                        slideOutHorizontally(animationSpec = tween(300)) { width -> -width } + fadeOut()
                    )
                } else {
                    (slideInHorizontally(animationSpec = tween(300)) { width -> -width } + fadeIn()).with(
                        slideOutHorizontally(animationSpec = tween(300)) { width -> width } + fadeOut()
                    )
                }
            },
            label = "MonthYearAnimation"
        ) { (month, year) ->
            val calendar = Calendar.getInstance().apply {
                set(Calendar.DAY_OF_MONTH, 1)
                set(Calendar.MONTH, month)
                set(Calendar.YEAR, year)
            }
            val monthYearString = SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(calendar.time)

            Text(
                text = monthYearString,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = DeepIndigo
            )
        }

        IconButton(
            onClick = {
                slideDirection = 1
                if (currentMonth == 11) {
                    onMonthChanged(0, currentYear + 1)
                } else {
                    onMonthChanged(currentMonth + 1, currentYear)
                }
            }
        ) {
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = "Next Month",
                tint = DeepIndigo
            )
        }
    }
}
