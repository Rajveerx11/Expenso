package com.expenso.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val ExpensoColorScheme = lightColorScheme(
    primary = DeepIndigo,
    onPrimary = White,
    primaryContainer = IndigoContainer,
    onPrimaryContainer = NearBlack,
    secondary = SoftIndigo,
    onSecondary = White,
    secondaryContainer = LightestIndigo,
    onSecondaryContainer = NearBlack,
    tertiary = EmeraldGreen,
    onTertiary = White,
    error = RoseRed,
    onError = White,
    errorContainer = SoftRed,
    onErrorContainer = NearBlack,
    background = White,
    onBackground = NearBlack,
    surface = White,
    onSurface = NearBlack,
    surfaceVariant = Snow,
    onSurfaceVariant = DarkGrey,
    outline = LightGrey,
    outlineVariant = MediumGrey
)

@Composable
fun ExpensoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ExpensoColorScheme,
        typography = ExpensoTypography,
        content = content
    )
}
