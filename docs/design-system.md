# Expenso — UI/UX Design System & Screen Specifications

> Premium glassmorphism design language inspired by Apple's design philosophy.
> Light, clean, breathable — every pixel intentional.

---

## 🎨 Design Philosophy

1. **Apple-Inspired Minimalism**: Clean layouts, generous whitespace, focus on content
2. **Glassmorphism 2.0**: Frosted glass surfaces with depth, not flat overlays
3. **Color with Purpose**: Green = money in, Red = money out, everything else is neutral
4. **Micro-Animations Everywhere**: Spring physics, shared transitions, haptic-like feedback
5. **One-Handed Usability**: Critical actions reachable by thumb, bottom sheets over full screens

---

## 🎨 Color Palette

### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Deep Indigo** | `#4F46E5` | Primary brand color, CTAs, header accents |
| **Soft Indigo** | `#818CF8` | Secondary actions, lighter accents |
| **Lightest Indigo** | `#EEF2FF` | Subtle backgrounds, selected states |

### Semantic Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Emerald Green** | `#10B981` | Income, money owed TO you, positive balance |
| **Soft Green** | `#D1FAE5` | Green chip backgrounds |
| **Rose Red** | `#F43F5E` | Expenses, money you OWE, negative balance |
| **Soft Red** | `#FFE4E6` | Red chip backgrounds |
| **Amber** | `#F59E0B` | Pending states, warnings |
| **Soft Amber** | `#FEF3C7` | Pending chip backgrounds |

### Neutral Colors
| Name | Hex | Usage |
|------|-----|-------|
| **White** | `#FFFFFF` | Page backgrounds |
| **Snow** | `#FAFAFA` | Card backgrounds (non-glass) |
| **Light Grey** | `#F3F4F6` | Dividers, input backgrounds |
| **Medium Grey** | `#9CA3AF` | Secondary text, placeholders |
| **Dark Grey** | `#374151` | Body text |
| **Near Black** | `#111827` | Headlines, primary text |

### Glassmorphism
| Property | Value |
|----------|-------|
| Background | `rgba(255, 255, 255, 0.65)` |
| Blur | `20dp` |
| Border | `1dp solid rgba(255, 255, 255, 0.3)` |
| Shadow | `0dp 8dp 32dp rgba(0, 0, 0, 0.08)` |
| Border Radius | `24dp` |

---

## ✏️ Typography

**Font Family**: [Inter](https://fonts.google.com/specimen/Inter) (variable weight)

| Style | Weight | Size | Line Height | Usage |
|-------|--------|------|-------------|-------|
| **Display** | 700 (Bold) | 32sp | 40sp | Balance amount, big numbers |
| **Headline** | 600 (SemiBold) | 24sp | 32sp | Screen titles |
| **Title** | 600 (SemiBold) | 20sp | 28sp | Card titles, section headers |
| **Body Large** | 400 (Regular) | 16sp | 24sp | Primary content |
| **Body** | 400 (Regular) | 14sp | 20sp | Secondary content |
| **Label** | 500 (Medium) | 12sp | 16sp | Chips, tags, small labels |
| **Caption** | 400 (Regular) | 11sp | 14sp | Timestamps, footnotes |

---

## 📐 Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4dp | Tight internal padding |
| `space-sm` | 8dp | Between related elements |
| `space-md` | 12dp | Component internal padding |
| `space-lg` | 16dp | Between sections, card padding |
| `space-xl` | 24dp | Screen horizontal padding |
| `space-2xl` | 32dp | Between major sections |
| `space-3xl` | 48dp | Top of screen content |

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 8dp | Small chips, tags |
| `radius-md` | 12dp | Buttons, input fields |
| `radius-lg` | 16dp | Small cards |
| `radius-xl` | 24dp | Major cards, bottom sheets |
| `radius-full` | 999dp | Avatars, circular buttons |

---

## 📱 Screen Specifications

### Screen 1: Splash Screen

```
┌──────────────────────────┐
│                          │
│                          │
│                          │
│      ┌──────────┐        │
│      │  EXPENSO │        │
│      │   LOGO   │        │
│      └──────────┘        │
│                          │
│    ● ● ● loading dots    │
│                          │
│                          │
│                          │
│   gradient: indigo→white │
└──────────────────────────┘
```

- **Background**: Soft gradient from `#4F46E5` (top) to `#EEF2FF` (bottom)
- **Logo**: App icon with scale-up spring animation
- **Loading**: 3-dot pulse animation below logo
- **Duration**: 1.5s → auto-navigate based on auth state

---

### Screen 2: Login Screen

```
┌──────────────────────────┐
│ ⠀⠀⠀gradient background⠀  │
│ ⠀⠀⠀with subtle circles⠀  │
│                          │
│   ┌────────────────────┐ │
│   │   ⠀⠀ 🎯 EXPENSO     │ │
│   │   ⠀⠀               │ │
│   │  "Track. Split.    │ │
│   │   Settle."         │ │
│   │                    │ │
│   │  ┌──────────────┐  │ │
│   │  │ G  Sign in   │  │ │
│   │  │    with Google│  │ │
│   │  └──────────────┘  │ │
│   │                    │ │
│   └── glass card ──────┘ │
│                          │
└──────────────────────────┘
```

- **Background**: Animated gradient with floating soft circles/blobs
- **Glass Card**: Center-positioned, `blur: 20dp`, white 65% opacity
- **Logo**: Large, above tagline
- **Tagline**: "Track. Split. Settle." — Inter SemiBold 20sp
- **Google Button**: Full width, Material3 style with Google "G" icon
- **Animation**: Card slides up from bottom with spring physics

---

### Screen 3: Home Dashboard

```
┌──────────────────────────┐
│ Hey, Yuvraj 👋      🔔 3 │
│ Good afternoon            │
│                           │
│ ┌─ GLASS CARD ──────────┐│
│ │  Current Balance       ││
│ │  ₹ 24,500         ▲5% ││
│ │                        ││
│ │  Income    Expenses    ││
│ │  ₹8,000   ₹3,500      ││
│ │  ↑ green  ↓ red        ││
│ └────────────────────────┘│
│                           │
│ ┌─── Quick Actions ─────┐│
│ │  [+ Expense] [+ Income]│
│ │  [👥 Group]  [📊 Stats]│
│ └────────────────────────┘│
│                           │
│ ┌─── You Owe ───────────┐│
│ │  Total: ₹1,200 (red)  ││
│ │  ───────────────────   ││
│ │  Owed to you: ₹800    ││
│ │  (green)               ││
│ └────────────────────────┘│
│                           │
│  Recent Activity          │
│  ┌────────────────────┐  │
│  │ 🍕 Dinner  -₹300   │  │
│  │ Today • From Group  │  │
│  ├────────────────────┤  │
│  │ 💼 Salary  +₹8,000 │  │
│  │ Aug 1 • Income      │  │
│  └────────────────────┘  │
│                           │
├───────────────────────────┤
│ 🏠  💰  👥  👤            │
│ Home Exp Groups Profile   │
└───────────────────────────┘
```

- **Greeting**: Dynamic based on time (Morning/Afternoon/Evening)
- **Balance Card**: Glassmorphism, animated counter for balance
- **Quick Actions**: 4 rounded buttons in 2×2 grid
- **Owe Summary**: Split into "You owe" (red) and "Owed to you" (green)
- **Recent Activity**: Last 5-10 items, mixed personal + group
- **Bottom Nav**: 4 tabs with rounded indicators

---

### Screen 4: Personal Expenses

```
┌──────────────────────────┐
│  ← Expenses         🔍   │
│                           │
│  [All] [Income] [Expense] │
│                           │
│  August 2026              │
│  ┌────────────────────┐  │
│  │ 🍕 Pizza     -₹450 │  │
│  │ Aug 10 • Food       │  │
│  ├────────────────────┤  │
│  │ 🚗 Uber      -₹200 │  │
│  │ Aug 9 • Transport   │  │
│  ├────────────────────┤  │
│  │ 👥 Dinner    -₹300 │  │
│  │ Aug 8 • Group:Trip  │  │ ← badge showing group source
│  ├────────────────────┤  │
│  │ 💼 Salary   +₹8000 │  │ ← green
│  │ Aug 1 • Income      │  │
│  └────────────────────┘  │
│                           │
│  July 2026                │
│  ┌────────────────────┐  │
│  │ ...                 │  │
│  └────────────────────┘  │
│                           │
│               ┌───┐       │
│               │ + │       │
│               └───┘       │
└──────────────────────────┘
```

- **Filters**: Chip-based tabs for All/Income/Expense
- **Month Grouping**: Sticky month headers
- **List Items**: Category icon + title + amount (green for income, red for expense)
- **Group Badge**: Small pill badge showing "From: [Group Name]" for auto-linked expenses
- **Swipe Actions**: Swipe left to delete (with confirmation)
- **FAB**: Floating action button to add new expense

---

### Screen 5: Add Personal Expense (Bottom Sheet)

```
┌──────────────────────────┐
│  ──── (drag handle) ──── │
│                           │
│  Add Expense              │
│                           │
│  ┌────────────────────┐  │
│  │ ₹ 0                │  │ ← large amount input
│  └────────────────────┘  │
│                           │
│  [Income ○] [Expense ●]  │ ← toggle
│                           │
│  Title                    │
│  ┌────────────────────┐  │
│  │ What did you spend  │  │
│  │ on?                 │  │
│  └────────────────────┘  │
│                           │
│  Category                 │
│  [🍕Food] [🚗Transport]  │
│  [🛒Shop] [🎬Entertain]  │
│  [💡Bills] [💊Health]    │
│  [📚Study] [✨Other]     │
│                           │
│  Date: [Aug 10, 2026  ▼] │
│                           │
│  Note (optional)          │
│  ┌────────────────────┐  │
│  │                     │  │
│  └────────────────────┘  │
│                           │
│  ┌────────────────────┐  │
│  │    Add Expense      │  │ ← indigo button
│  └────────────────────┘  │
└──────────────────────────┘
```

- **Amount Input**: Large, prominent, auto-focused with numeric keyboard
- **Type Toggle**: Animated segmented control (Income/Expense)
- **Category Chips**: Scrollable horizontal chips with icons, highlight on select
- **Date Picker**: Material3 date picker dialog
- **Glass Bottom Sheet**: Rounded top corners, drag handle
- **Validation**: Button disabled until amount + title filled

---

### Screen 6: Group List

```
┌──────────────────────────┐
│  Groups              + ┐  │
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │  🖼️ Trip to Goa      ││
│  │  4 members            ││
│  │  You owe ₹1,200  🔴  ││
│  └───────────────────────┘│
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │  🖼️ Roommates        ││
│  │  3 members            ││
│  │  Owed ₹800      🟢   ││
│  └───────────────────────┘│
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │  🖼️ Office Lunch     ││
│  │  6 members            ││
│  │  Settled up     ⚪    ││
│  └───────────────────────┘│
│                           │
└──────────────────────────┘
```

- **Group Cards**: Glass cards with group image, name, member count, net balance
- **Balance Indicator**: Colored dot + amount (green/red/grey)
- **Create Button**: Top-right "+" icon or FAB
- **Empty State**: Beautiful illustration + "Create your first group"

---

### Screen 7: Group Detail (Most Complex Screen)

```
┌──────────────────────────┐
│  ← Trip to Goa      ⚙️   │
│  ┌───────────────────────┐│
│  │   🖼️ Group Image      ││
│  │   4 members           ││
│  │   Total: ₹12,500      ││
│  └───────────────────────┘│
│                           │
│  [Members] [Expenses]     │ ← Tab bar
│                           │
│  ── Members Tab ──        │
│                           │
│  ┌────────────────────┐  │
│  │ 📷 Yuvraj (You)    │  │
│  │ ₹0 — settled   ⚪  │  │
│  ├────────────────────┤  │
│  │ 📷 Rahul           │  │
│  │ owes you ₹500  🟢  │  │ ← GREEN
│  ├────────────────────┤  │
│  │ 📷 Priya           │  │
│  │ you owe ₹300   🔴  │  │ ← RED
│  │              [Pay ▸]│  │ ← PAY button
│  ├────────────────────┤  │
│  │ 📷 Amit            │  │
│  │ owes you ₹200  🟢  │  │
│  └────────────────────┘  │
│                           │
│  ── Expenses Tab ──       │
│                           │
│  ┌────────────────────┐  │
│  │ 🍕 Dinner  ₹1,200  │  │
│  │ Paid by Yuvraj      │  │
│  │ Aug 8 • 4-way split │  │
│  ├────────────────────┤  │
│  │ 🚕 Cab     ₹600    │  │
│  │ Paid by Rahul       │  │
│  │ Aug 7 • 3-way split │  │
│  └────────────────────┘  │
│                           │
│               ┌───┐       │
│               │ + │       │
│               └───┘       │
└──────────────────────────┘
```

### Member Row Detail:

```
┌─────────────────────────────────────┐
│  [Avatar]  Name                     │
│            status text    [amount]  │
│                           [Pay ▸]   │ ← only when you owe
└─────────────────────────────────────┘
```

- **Avatar**: 44dp circular image from profile
- **Name**: Inter SemiBold 16sp
- **Status**: "owes you" (green) / "you owe" (red) / "settled" (grey)
- **Amount**: Bold, colored (green ₹500 / red ₹300)
- **Pay Button**: Only shows when YOU OWE. Rose red chip with "Pay ▸" text
- **Settings Gear**: Only visible if you are the admin

---

### Screen 8: Add Group Expense (Bottom Sheet)

```
┌──────────────────────────┐
│  ──── (drag handle) ──── │
│                           │
│  Add Group Expense        │
│                           │
│  ┌────────────────────┐  │
│  │ ₹ 0                │  │ ← amount input
│  └────────────────────┘  │
│                           │
│  Title                    │
│  ┌────────────────────┐  │
│  │ What was it for?    │  │
│  └────────────────────┘  │
│                           │
│  Paid by                  │
│  [📷 You (Yuvraj)    ▼]  │ ← dropdown
│                           │
│  Split among              │
│  [Equal ●] [Exact] [%]   │ ← split type
│                           │
│  ┌────────────────────┐  │
│  │ ☑ 📷 Yuvraj  ₹300  │  │ ← checked
│  │ ☑ 📷 Rahul   ₹300  │  │ ← checked
│  │ ☑ 📷 Priya   ₹300  │  │ ← checked
│  │ ☑ 📷 Amit    ₹300  │  │ ← checked (all default checked)
│  └────────────────────┘  │
│                           │
│  Category                 │
│  [🍕Food] [🚗Transp] ... │
│                           │
│  ┌────────────────────┐  │
│  │   Add Expense       │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

- **All checkboxes ON by default** — user unchecks to exclude
- **Live split calculation**: Shows each person's share updating in real-time
- **Paid by dropdown**: Shows all members with avatars
- **Split type**: Animated segmented control
- **Validation**: Total of splits must equal expense amount

---

### Screen 9: Pay via UPI (Bottom Sheet)

```
┌──────────────────────────┐
│  ──── (drag handle) ──── │
│                           │
│  Pay Priya                │
│                           │
│  ┌────────────────────┐  │
│  │  📷 Priya Sharma   │  │
│  │  priya@okaxis      │  │ ← UPI ID
│  └────────────────────┘  │
│                           │
│  Amount                   │
│  ┌────────────────────┐  │
│  │ ₹ 300              │  │ ← pre-filled, editable
│  └────────────────────┘  │
│  You owe ₹300 total       │
│                           │
│  ┌────────────────────┐  │
│  │  Choose UPI App ▸   │  │ ← launches intent
│  └────────────────────┘  │
│                           │
│  After payment, come back │
│  and confirm here.        │
│                           │
└──────────────────────────┘
```

---

### Screen 10: Payment Confirmation

#### For Payer (after returning from UPI app):
```
┌──────────────────────────┐
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │                       ││
│  │   Did you pay Priya?  ││
│  │                       ││
│  │   ₹300                ││
│  │                       ││
│  │  ┌─────────────────┐  ││
│  │  │  Yes, I Paid ✓  │  ││ ← green button
│  │  └─────────────────┘  ││
│  │  ┌─────────────────┐  ││
│  │  │  Cancel          │  ││ ← outlined button
│  │  └─────────────────┘  ││
│  └───────────────────────┘│
│                           │
│  This will send a         │
│  confirmation request     │
│  to Priya.                │
│                           │
└──────────────────────────┘
```

#### For Receiver (notification tap):
```
┌──────────────────────────┐
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │                       ││
│  │  📷 Yuvraj says they ││
│  │  paid you             ││
│  │                       ││
│  │   ₹300                ││
│  │   Trip to Goa         ││
│  │                       ││
│  │  ┌─────────────────┐  ││
│  │  │  Confirm ✓      │  ││ ← green button
│  │  └─────────────────┘  ││
│  │  ┌─────────────────┐  ││
│  │  │  Reject ✗       │  ││ ← red outlined
│  │  └─────────────────┘  ││
│  └───────────────────────┘│
│                           │
└──────────────────────────┘
```

---

### Screen 11: Profile Screen

```
┌──────────────────────────┐
│  Profile                  │
│                           │
│  ┌─ GLASS CARD ─────────┐│
│  │                       ││
│  │      📷 (large)       ││ ← 80dp avatar
│  │    Yuvraj Singh       ││
│  │    yuvraj@gmail.com   ││
│  │                       ││
│  │    UPI: yuvraj@okicici││
│  │                       ││
│  │  [Edit Profile ▸]     ││
│  └───────────────────────┘│
│                           │
│  ┌────────────────────┐  │
│  │ 💰 Total Income     │  │
│  │ ₹45,000             │  │
│  ├────────────────────┤  │
│  │ 💸 Total Expenses   │  │
│  │ ₹28,500             │  │
│  ├────────────────────┤  │
│  │ 📊 Net Balance      │  │
│  │ ₹16,500             │  │
│  └────────────────────┘  │
│                           │
│  ┌────────────────────┐  │
│  │ 🔔 Notifications    ▸│  │
│  ├────────────────────┤  │
│  │ 📋 Export Data      ▸│  │
│  ├────────────────────┤  │
│  │ ❓ Help & Support   ▸│  │
│  ├────────────────────┤  │
│  │ 🚪 Sign Out         │  │ ← red text
│  └────────────────────┘  │
│                           │
└──────────────────────────┘
```

---

## 🎬 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| **Screen transitions** | Shared axis (horizontal) | 300ms | FastOutSlowIn |
| **Bottom sheet appear** | Slide up + fade | 250ms | Spring(0.8) |
| **Balance counter** | Number counter animation | 600ms | LinearOutSlowIn |
| **Card appear** | Fade in + slight scale up | 200ms | Spring(0.9) |
| **FAB press** | Scale down 0.95 + haptic | 100ms | DecelerateEasing |
| **List item appear** | Staggered slide up + fade | 50ms delay each | Spring(0.85) |
| **Tab switch** | Cross-fade | 200ms | LinearEasing |
| **Swipe to delete** | Slide out + background reveal | 300ms | FastOutSlowIn |
| **Success feedback** | Checkmark draw + scale | 400ms | Spring(0.7) |
| **Pull to refresh** | Custom indicator | Variable | Standard |

---

## 📱 Component Library

### GlassCard
```
Properties:
  - blurRadius: 20dp (default)
  - backgroundAlpha: 0.65 (default)
  - borderWidth: 1dp
  - borderColor: white 30%
  - cornerRadius: 24dp
  - elevation: 8dp (shadow)
  - padding: 16dp-24dp
```

### BalanceChip
```
Variants:
  - Positive (Green): bg=#D1FAE5, text=#10B981, icon=↑
  - Negative (Red): bg=#FFE4E6, text=#F43F5E, icon=↓
  - Neutral (Grey): bg=#F3F4F6, text=#9CA3AF, icon=—
  - Pending (Amber): bg=#FEF3C7, text=#F59E0B, icon=⏳
```

### MemberRow
```
Layout:
  [Avatar 44dp] [Gap 12dp] [Name + Status] [Spacer] [Amount] [PayButton?]
  
  Avatar: Circular, Coil image loader, placeholder = initials
  Name: Inter SemiBold 16sp, Near Black
  Status: Inter Regular 13sp, semantic color
  Amount: Inter Bold 16sp, semantic color
  PayButton: Only when status=negative, Rose chip with "Pay ▸"
```

### ExpenseCard
```
Layout:
  [Category Icon 40dp] [Gap 12dp] [Title + Meta] [Spacer] [Amount]
  
  Icon: Rounded square bg with category color, icon centered
  Title: Inter SemiBold 15sp
  Meta: Inter Regular 12sp, Medium Grey, "Date • Category/Group"
  Amount: Inter Bold 16sp, green(+) or red(-)
```

### QuickActionButton
```
Layout:
  Rounded rectangle (radius 16dp)
  Background: Lightest Indigo
  Icon: 24dp, Deep Indigo
  Label: Inter Medium 12sp
  Size: Fill 50% width, 56dp height
  Interaction: Scale to 0.96 on press, spring back
```

---

## 📱 Bottom Navigation

```
┌───────────────────────────────────┐
│  🏠        💰        👥        👤 │
│  Home    Expenses   Groups   Profile│
│  ●                                 │ ← Active indicator (pill shape)
└───────────────────────────────────┘
```

- **Style**: Rounded pill indicator for active tab
- **Color**: Active = Deep Indigo, Inactive = Medium Grey
- **Labels**: Always visible (not hidden on scroll)
- **Animation**: Indicator slides smoothly between tabs
- **Background**: White with top border (Light Grey 0.5dp)

---

## 🌐 Empty States

Each screen has a beautiful empty state with:
1. **Illustration**: Simple, relevant vector illustration
2. **Headline**: Clear, friendly message
3. **Subtitle**: Brief instruction on what to do
4. **CTA Button**: Primary action to get started

| Screen | Headline | Subtitle | CTA |
|--------|----------|----------|-----|
| Personal Expenses | "No expenses yet" | "Start tracking your spending" | "+ Add Expense" |
| Groups | "No groups yet" | "Create a group to split expenses" | "+ Create Group" |
| Group Expenses | "No expenses in this group" | "Add the first expense to start splitting" | "+ Add Expense" |
| Notifications | "All caught up! 🎉" | "You'll see payment confirmations here" | — |
