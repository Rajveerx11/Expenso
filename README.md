# Expenso 💰

> **Your Free Personal & Group Expense Manager**
> Track. Split. Settle. — Beautifully.

---

## 📖 About

Expenso is a lightweight, premium Android app that helps you manage personal finances and split group expenses effortlessly. Inspired by Splitwise but completely free, with a beautiful glassmorphism UI and integrated UPI payments.

## ✨ Key Features

### Personal Finance
- 💰 Track income and expenses
- 📊 Running balance calculation
- 📅 Monthly expense grouping
- 🏷️ Category-based organization (Food, Transport, Shopping, Bills, etc.)
- 🔗 Auto-linked group expenses in personal feed

### Group Expenses
- 👥 Create unlimited groups
- ✂️ Split expenses equally, by exact amounts, or by percentage
- ☑️ Easy splitting — all members checked by default, uncheck to exclude
- 🔒 Admin-only group management (like Google product sharing)
- 📊 Real-time balance tracking per member

### Payments & Settlements
- 💳 Direct UPI payment from within the app
- 🔴 Red = You owe (with "Pay" button)
- 🟢 Green = They owe you
- ✅ Two-party payment confirmation system
- 🔔 Push notifications for payment requests
- 🔐 Secure confirmation token workflow

### Profile
- 📷 Google profile photo (changeable)
- ✏️ Editable name and UPI ID
- 📊 Financial summary dashboard

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Kotlin |
| UI | Jetpack Compose + Material3 |
| Architecture | MVVM + Clean Architecture |
| DI | Hilt |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Auth | Google OAuth via Credential Manager |
| Notifications | FCM + Supabase Edge Functions |
| Images | Coil |
| Glassmorphism | Haze Library |
| Payments | Android UPI Intent |

## 📁 Documentation

| Document | Description |
|----------|-------------|
| [Implementation Plan](docs/../../../.gemini/antigravity/brain/32ff5313-3c45-4a6f-b11c-fcc32e982592/implementation_plan.md) | Full project plan with phases, open questions, and setup guide |
| [Architecture](docs/architecture.md) | Database schema, SQL, RLS policies, Edge Functions, dependencies |
| [Design System](docs/design-system.md) | Colors, typography, components, screen wireframes, animations |
| [Workflows](docs/workflows.md) | User flows, state machines, sequence diagrams, edge cases |

## 🏗️ Project Structure

```
app/src/main/java/com/expenso/app/
├── core/          # DI, networking, utilities, notifications
├── domain/        # Models, repository interfaces, use cases
├── data/          # Repository implementations, DTOs, mappers
└── ui/            # Screens, components, theme, navigation
```

## 🚀 Getting Started

### Prerequisites
1. Android Studio Ladybug (2024.2+)
2. JDK 17+
3. Google Cloud Console project
4. Firebase project
5. Supabase project

### Setup Steps
See the [Implementation Plan](docs/../../../.gemini/antigravity/brain/32ff5313-3c45-4a6f-b11c-fcc32e982592/implementation_plan.md#manual-setup-guide-for-you) for detailed step-by-step instructions.

## 📱 Min Requirements

- **Android**: 8.0 (API 26)+
- **Target**: Android 15 (API 35)
- **Internet**: Required (online-first)

## 📄 License

This project is for personal use.
