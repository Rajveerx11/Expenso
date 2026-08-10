# Expenso — User Flow & Workflow Documentation

> Detailed user journeys, state machines, and interaction patterns for every feature.

---

## 1. Authentication Flow

```mermaid
stateDiagram-v2
    [*] --> SplashScreen
    SplashScreen --> CheckAuth: App Launch
    
    CheckAuth --> Dashboard: Session Valid
    CheckAuth --> LoginScreen: No Session
    
    LoginScreen --> GoogleSignIn: Tap "Sign in with Google"
    GoogleSignIn --> CredentialManager: Native Prompt
    CredentialManager --> SupabaseAuth: Token Exchange
    
    SupabaseAuth --> CheckNewUser: Auth Success
    SupabaseAuth --> LoginScreen: Auth Failed (Show Error)
    
    CheckNewUser --> OnboardingScreen: First Time User
    CheckNewUser --> Dashboard: Returning User
    
    OnboardingScreen --> AddUPIScreen: Slide 1: Welcome
    AddUPIScreen --> Dashboard: Slide 2: Add UPI ID → Start
    
    Dashboard --> LoginScreen: Sign Out
```

### Detailed Steps:
1. **App opens** → Splash screen with logo animation (1.5s)
2. **Check Supabase session** → If valid token exists, auto-navigate to Dashboard
3. **No session** → Show Login screen with gradient background
4. **User taps "Sign in with Google"** → Android Credential Manager shows account picker
5. **Select Google account** → Credential Manager returns ID token to Supabase
6. **Supabase authenticates** → Creates/fetches user in `auth.users`
7. **Check `profiles` table** → If no row exists, it's a new user
8. **New user**: Insert profile row with Google name, email, photo → Show onboarding
9. **Onboarding**: Welcome → Enter UPI ID (optional, can skip) → Navigate to Dashboard
10. **Returning user**: Navigate directly to Dashboard

---

## 2. Personal Expense Flow

### Adding Income

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Add Income Sheet
    participant VM as ViewModel
    participant UC as AddIncomeUseCase
    participant R as Repository
    participant DB as Supabase

    U->>UI: Tap "+" → Select "Add Income"
    UI->>UI: Show bottom sheet
    U->>UI: Enter amount, title, category, date
    U->>UI: Tap "Add Income"
    UI->>VM: AddIncomeEvent(data)
    VM->>UC: execute(incomeData)
    UC->>R: insertPersonalExpense(type=income)
    R->>DB: INSERT into personal_expenses
    DB-->>R: Success
    UC->>R: updateBalance(+amount)
    R->>DB: UPDATE profiles SET total_income, total_balance
    DB-->>R: Success
    UC-->>VM: Result.Success
    VM-->>UI: State = Success (dismiss sheet)
    UI->>U: Show success animation + updated balance
```

### Adding Personal Expense

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Add Expense Sheet
    participant VM as ViewModel
    participant UC as AddExpenseUseCase
    participant R as Repository
    participant DB as Supabase

    U->>UI: Tap "+" → Select "Add Expense"
    UI->>UI: Show bottom sheet
    U->>UI: Enter amount, title, select category chip, date
    U->>UI: Tap "Add Expense"
    UI->>VM: AddExpenseEvent(data)
    VM->>UC: execute(expenseData)
    UC->>R: insertPersonalExpense(type=expense)
    R->>DB: INSERT into personal_expenses
    DB-->>R: Success
    UC->>R: updateBalance(-amount)
    R->>DB: UPDATE profiles SET total_balance
    DB-->>R: Success
    UC-->>VM: Result.Success
    VM-->>UI: State = Success (dismiss sheet)
    UI->>U: Show success animation + updated balance
```

### Balance Calculation Logic

```
total_balance = total_income
              - SUM(personal_expenses WHERE type='expense')
              + SUM(confirmed settlements WHERE I am receiver)
              - SUM(confirmed settlements WHERE I am payer)
```

When a group expense is added where the user is involved:
- A `personal_expense` entry is auto-created with `source_group_expense_id` set
- The user's `total_balance` is updated by deducting their share

---

## 3. Group Management Flow

### Creating a Group

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Create Group Screen
    participant VM as ViewModel
    participant UC as CreateGroupUseCase
    participant R as Repository
    participant DB as Supabase
    participant S as Supabase Storage

    U->>UI: Tap "Create Group"
    UI->>UI: Show full screen form
    U->>UI: Enter name, description
    U->>UI: (Optional) Pick group image
    U->>UI: Tap "Create"
    
    alt Has Image
        UI->>VM: CreateGroupEvent(data, image)
        VM->>UC: execute(groupData, imageFile)
        UC->>R: uploadImage(imageFile)
        R->>S: Upload to 'group-images' bucket
        S-->>R: imageUrl
    end
    
    UC->>R: createGroup(name, desc, imageUrl)
    R->>DB: INSERT into groups (created_by = auth.uid())
    DB-->>R: groupId
    UC->>R: addMember(groupId, auth.uid(), role='admin')
    R->>DB: INSERT into group_members
    DB-->>R: Success
    UC-->>VM: Result.Success(group)
    VM-->>UI: Navigate to Group Detail
```

### Adding Members

```mermaid
sequenceDiagram
    participant Admin as Group Admin
    participant UI as Add Member Sheet
    participant VM as ViewModel
    participant R as Repository
    participant DB as Supabase
    participant FCM as FCM Service

    Admin->>UI: Tap "Add Member" in group settings
    UI->>UI: Show search bottom sheet
    Admin->>UI: Type email address
    UI->>VM: SearchUser(email)
    VM->>R: findUserByEmail(email)
    R->>DB: SELECT FROM profiles WHERE email ILIKE '%query%'
    DB-->>R: User profile (or empty)
    R-->>VM: SearchResult
    
    alt User Found
        VM-->>UI: Show user card (photo, name, email)
        Admin->>UI: Tap "Add" on user card
        UI->>VM: AddMemberEvent(userId, groupId)
        VM->>R: addGroupMember(groupId, userId, role='editor')
        R->>DB: INSERT into group_members
        DB-->>R: Success
        VM->>FCM: Notify user "You were added to [Group]"
        VM-->>UI: Member added, refresh list
    else User Not Found
        VM-->>UI: Show "No user found with this email"
        UI->>Admin: Suggest: "They need to install Expenso first"
    end
```

### Access Control Matrix

| Action | Admin | Editor |
|--------|-------|--------|
| View group | ✅ | ✅ |
| Add expenses | ✅ | ✅ |
| Edit expenses (own) | ✅ | ✅ |
| Delete expenses (own) | ✅ | ✅ |
| View all members | ✅ | ✅ |
| View balances | ✅ | ✅ |
| Edit group name/image | ✅ | ❌ |
| Add members | ✅ | ❌ |
| Remove members | ✅ | ❌ |
| Delete group | ✅ | ❌ |

---

## 4. Group Expense & Splitting Flow

### Adding a Group Expense

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Add Expense Sheet
    participant VM as ViewModel
    participant UC as AddGroupExpenseUseCase
    participant SC as CalculateSplitsUseCase
    participant R as Repository
    participant DB as Supabase

    U->>UI: Tap "+" in group
    UI->>UI: Show bottom sheet with all group members
    U->>UI: Enter title, amount
    U->>UI: Select "Paid by" (default: You)
    U->>UI: All member checkboxes shown (ALL checked by default)
    
    opt Exclude Members
        U->>UI: Uncheck member(s) to exclude from split
    end
    
    U->>UI: Select split type (Equal | Exact | Percentage)
    
    alt Equal Split
        UI->>UI: Auto-calculate: amount ÷ checked members
    else Exact Amounts
        U->>UI: Enter specific amount per member
        UI->>UI: Validate: sum must equal total
    else Percentage
        U->>UI: Enter percentage per member
        UI->>UI: Validate: must sum to 100%
    end
    
    U->>UI: Tap "Add Expense"
    UI->>VM: AddGroupExpenseEvent(data)
    VM->>SC: calculate(amount, members, splitType)
    SC-->>VM: List<Split>(userId, amount)
    VM->>UC: execute(expenseData, splits)
    
    Note over UC,DB: Atomic Transaction
    UC->>R: insertGroupExpense(data)
    R->>DB: INSERT into group_expenses
    UC->>R: insertSplits(splits)
    R->>DB: INSERT BATCH into expense_splits
    
    loop For each involved member
        UC->>R: createPersonalExpenseEntry(userId, share)
        R->>DB: INSERT into personal_expenses (source_group_expense_id set)
        UC->>R: updateBalance(userId, -share)
        R->>DB: UPDATE profiles balance for userId
    end
    
    Note over UC: Payer gets credit (they paid full, owe only their share)
    UC->>R: adjustPayerBalance(payerId, totalAmount - payerShare)
    
    UC-->>VM: Result.Success
    VM-->>UI: Dismiss sheet, refresh group
    UI->>U: Success animation + updated balances
```

### Split Calculation Examples

**Scenario**: Dinner costs ₹1,200. Paid by Alice. Group has Alice, Bob, Charlie, Dave.

#### Equal Split (all 4 checked):
| Person | Share | Owes to Alice |
|--------|-------|---------------|
| Alice (payer) | ₹300 | — |
| Bob | ₹300 | ₹300 |
| Charlie | ₹300 | ₹300 |
| Dave | ₹300 | ₹300 |

#### Equal Split (Dave unchecked — only 3 people):
| Person | Share | Owes to Alice |
|--------|-------|---------------|
| Alice (payer) | ₹400 | — |
| Bob | ₹400 | ₹400 |
| Charlie | ₹400 | ₹400 |
| Dave | — | — |

### Balance Computation Algorithm

For a group with N expenses:

```
For each member pair (A, B):
    balance_A_to_B = 0
    
    For each expense E:
        if E.paid_by == A and B has a split in E:
            balance_A_to_B += B's split amount    # B owes A
        if E.paid_by == B and A has a split in E:
            balance_A_to_B -= A's split amount    # A owes B
    
    For each confirmed settlement S between A and B:
        if S.payer == B and S.receiver == A:
            balance_A_to_B -= S.amount            # B paid A back
        if S.payer == A and S.receiver == B:
            balance_A_to_B += S.amount            # A paid B (shouldn't normally happen here)
    
    if balance_A_to_B > 0:
        "B owes A ₹{balance_A_to_B}"  → Show GREEN next to B for A's view
    elif balance_A_to_B < 0:
        "A owes B ₹{|balance_A_to_B|}"  → Show RED next to B for A's view + PAY button
    else:
        "Settled up"  → Show GREY
```

---

## 5. UPI Payment & Confirmation Flow

This is the most complex flow — here's the complete state machine:

```mermaid
stateDiagram-v2
    [*] --> ViewGroupBalances
    
    ViewGroupBalances --> PaymentSheet: Tap "Pay ₹X" (red button)
    
    PaymentSheet --> ValidateUPI: Confirm amount
    
    ValidateUPI --> UPIChooser: Receiver has UPI ID
    ValidateUPI --> ShowError: Receiver has no UPI ID
    ShowError --> PaymentSheet: "Ask them to add UPI ID"
    
    UPIChooser --> UPIApp: User selects UPI app
    UPIApp --> PinEntry: Pre-filled amount & UPI ID
    PinEntry --> PaymentComplete: User enters PIN
    PinEntry --> PaymentCancelled: User cancels
    
    PaymentComplete --> ReturnToApp: UPI app returns
    PaymentCancelled --> ReturnToApp: UPI app returns
    
    ReturnToApp --> ConfirmPaymentUI: Show "Did you pay?"
    
    ConfirmPaymentUI --> CreateSettlement: Tap "Yes, I Paid ₹X"
    ConfirmPaymentUI --> ViewGroupBalances: Tap "Cancel"
    
    CreateSettlement --> PendingState: Settlement created (status=pending)
    PendingState --> NotifyReceiver: Send FCM notification
    
    NotifyReceiver --> ReceiverOpensApp: "[Name] paid you ₹X. Confirm?"
    ReceiverOpensApp --> ConfirmDialog: Tap notification
    
    ConfirmDialog --> Confirmed: Tap "Confirm"
    ConfirmDialog --> Rejected: Tap "Reject"
    
    Confirmed --> UpdateBalances: Atomic balance update
    UpdateBalances --> NotifyPayer: "Payment confirmed!"
    NotifyPayer --> [*]: Balances settled
    
    Rejected --> NotifyPayerRejected: "Payment rejected by [Name]"
    NotifyPayerRejected --> ViewGroupBalances: Payer sees rejection
```

### UPI Intent Data:

```kotlin
val upiUri = Uri.Builder()
    .scheme("upi")
    .authority("pay")
    .appendQueryParameter("pa", receiverUpiId)      // e.g., "user@okaxis"
    .appendQueryParameter("pn", receiverName)        // e.g., "Rahul Sharma"
    .appendQueryParameter("am", amount.toString())   // e.g., "500.00"
    .appendQueryParameter("cu", "INR")
    .appendQueryParameter("tr", transactionRef)      // UUID
    .appendQueryParameter("tn", "Expenso - $groupName settlement")
    .build()

val intent = Intent(Intent.ACTION_VIEW, upiUri)
startActivityForResult(Intent.createChooser(intent, "Pay with"), UPI_REQUEST_CODE)
```

### Confirmation Token System:

When payer taps "I Paid":
1. Generate a unique `confirmation_token` (UUID)
2. Create `settlement` record with `status = 'pending_confirmation'`
3. Create `payment_confirmation` record with `status = 'pending'`
4. Trigger Edge Function → send FCM to receiver
5. FCM payload includes: `settlement_id`, `amount`, `payer_name`, `confirmation_token`

When receiver taps "Confirm":
1. Verify `confirmation_token` matches
2. Update `settlement.status = 'confirmed'`
3. Update `payment_confirmation.status = 'confirmed'`
4. Mark relevant `expense_splits` as settled
5. Update both users' `total_balance` in `profiles`
6. Send FCM to payer: "Payment confirmed!"

---

## 6. Notification System Flow

```mermaid
sequenceDiagram
    participant App as Android App
    participant DB as Supabase DB
    participant WH as Database Webhook
    participant EF as Edge Function
    participant FCM as Firebase CM
    participant Device as Receiver Device

    App->>DB: INSERT settlement (status=pending)
    DB->>WH: Webhook trigger on INSERT
    WH->>EF: Invoke send-notification function
    EF->>DB: Query user_fcm_tokens for receiver
    DB-->>EF: fcm_token
    EF->>FCM: Send notification payload
    FCM->>Device: Push notification
    Device->>App: User taps notification
    App->>App: Navigate to confirmation dialog
```

### Notification Types:

| Event | Recipient | Title | Body |
|-------|-----------|-------|------|
| Payment Made | Receiver | "💰 Payment Received" | "{Name} says they paid you ₹{amount}. Tap to confirm." |
| Payment Confirmed | Payer | "✅ Payment Confirmed" | "{Name} confirmed your ₹{amount} payment." |
| Payment Rejected | Payer | "❌ Payment Rejected" | "{Name} rejected your ₹{amount} payment claim." |
| Expense Added | All Members | "📝 New Expense" | "{Name} added ₹{amount} for {title} in {group}." |
| Added to Group | New Member | "👥 Group Invite" | "{Name} added you to {group}." |
| Removed from Group | Removed | "👋 Group Update" | "You were removed from {group}." |

---

## 7. Profile Management Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Profile Screen
    participant VM as ProfileViewModel
    participant R as Repository
    participant S as Supabase Storage
    participant DB as Supabase DB

    U->>UI: Navigate to Profile tab
    VM->>R: getProfile(auth.uid())
    R->>DB: SELECT FROM profiles WHERE id = auth.uid()
    DB-->>R: Profile data
    R-->>VM: User model
    VM-->>UI: Display: avatar, name, email, UPI, balance

    U->>UI: Tap "Edit Profile"
    UI->>UI: Navigate to Edit Profile screen

    alt Change Avatar
        U->>UI: Tap avatar → Image picker
        UI->>VM: UpdateAvatar(imageUri)
        VM->>R: uploadAvatar(imageFile)
        R->>S: Upload to 'avatars/{userId}.jpg'
        S-->>R: publicUrl
        VM->>R: updateProfile(avatar_url = publicUrl)
        R->>DB: UPDATE profiles SET avatar_url
    end

    alt Change Name
        U->>UI: Edit name field
        UI->>VM: UpdateName(newName)
        VM->>R: updateProfile(full_name = newName)
        R->>DB: UPDATE profiles SET full_name
    end

    alt Change UPI ID
        U->>UI: Edit UPI ID field
        UI->>VM: UpdateUpiId(newUpiId)
        VM->>R: updateProfile(upi_id = newUpiId)
        R->>DB: UPDATE profiles SET upi_id
    end
```

---

## 8. Home Dashboard Data Flow

The home screen aggregates data from multiple sources:

```mermaid
graph TD
    A["HomeViewModel.init()"] --> B["Parallel Data Fetch"]
    B --> C["GetProfileUseCase"]
    B --> D["GetBalanceSummaryUseCase"]
    B --> E["GetRecentActivityUseCase"]
    B --> F["GetPendingConfirmationsUseCase"]
    B --> G["GetOwesSummaryUseCase"]
    
    C --> H["Profile: name, avatar, balance"]
    D --> I["Balance: income, expenses, net"]
    E --> J["Recent: last 10 transactions"]
    F --> K["Pending: unconfirmed payments"]
    G --> L["Owes: total owed to/from others"]
    
    H --> M["HomeUiState"]
    I --> M
    J --> M
    K --> M
    L --> M
    
    M --> N["UI Recomposition"]
```

### Dashboard Cards:
1. **Balance Card** (Glass): ₹XX,XXX current balance | ₹X,XXX income this month | ₹X,XXX expenses this month
2. **Owe Summary**: "You owe ₹1,200 total" (red) | "You are owed ₹800 total" (green)
3. **Pending Actions**: Payment confirmations waiting
4. **Recent Activity**: Mixed feed of personal + group transactions
5. **Quick Actions**: FAB with Add Expense / Add Income / Create Group

---

## 9. Data Sync: Group → Personal Expenses

When a group expense is created, each member's share is automatically reflected in their personal expenses:

```mermaid
graph LR
    A["Group Expense Created<br/>₹1200 Dinner<br/>Paid by Alice"] --> B["Split Calculation<br/>4 members × ₹300"]
    
    B --> C["Alice's Personal<br/>type: expense<br/>amount: ₹300<br/>source: group_expense_id"]
    B --> D["Bob's Personal<br/>type: expense<br/>amount: ₹300<br/>source: group_expense_id"]
    B --> E["Charlie's Personal<br/>type: expense<br/>amount: ₹300<br/>source: group_expense_id"]
    B --> F["Dave's Personal<br/>type: expense<br/>amount: ₹300<br/>source: group_expense_id"]
    
    C --> G["Alice balance: -₹300"]
    D --> H["Bob balance: -₹300"]
    E --> I["Charlie balance: -₹300"]
    F --> J["Dave balance: -₹300"]
```

> Personal expenses from groups show a badge/icon indicating "From Group: [Name]" so the user knows it wasn't manually added.

---

## 10. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| **User removed from group with unsettled debts** | Show warning to admin. Debts remain visible in the removed user's personal expenses. |
| **UPI app not installed** | Show toast: "No UPI app found. Please install one." |
| **Receiver has no UPI ID** | Disable "Pay" button, show tooltip: "Ask [Name] to add their UPI ID" |
| **Network failure during expense add** | Show retry dialog. Don't save partial data. |
| **Duplicate payment confirmation** | Server-side check: if already confirmed, return "Already settled" |
| **Group deleted with pending settlements** | Settle all debts before allowing deletion |
| **Partial payment** | User can edit amount before paying. Creates settlement for that amount only. Remaining debt stays. |
| **User pays more than owed** | Cap payment at owed amount. Don't allow overpayment. |
| **Same user in multiple groups with same person** | Each group maintains independent balances |
| **Delete group expense** | Reverse all splits, remove personal expense entries, recalculate balances |
