# Supabase backend setup

Expenso's database contract is versioned in `supabase/migrations`. Do not build
the production schema by copying SQL from the architecture document.

## Local verification

1. Install Docker and the Supabase CLI.
2. From the repository root, run `supabase start`.
3. Apply a clean database with `supabase db reset`.
4. Run `supabase db lint --local --level warning`.
5. Run the repository contract checks with
   `python -m unittest tests.test_supabase_contract`.

The local configuration contains no credentials. Client builds use only a
Supabase publishable key. Never put a secret or legacy `service_role` key in
the Android app.

## Remote deployment

Link the intended project explicitly, review the diff, then apply migrations:

```text
supabase link --project-ref <project-ref>
supabase db diff --linked
supabase db push --dry-run
supabase db push
```

Configure Auth providers and server-side secrets in the Supabase dashboard or
secret store. They do not belong in Git.

## Android-facing RPC contract

| Function | Parameters | Purpose |
| --- | --- | --- |
| `recalculate_balance` | `user_id_param` | Recalculate the signed personal balance for the caller. |
| `get_group_balances` | `group_id_param` | Return caller-relative balances for other group members. |
| `create_group_expense` | group, payer, expense fields, `splits_param` | Atomically create the expense, splits, and linked personal-feed entries. |
| `delete_group_expense` | `expense_id_param` | Atomically remove an authorized expense and reverse linked entries. |
| `create_settlement` | group, receiver, amount, reference | Create one bounded pending settlement and confirmation. |
| `confirm_settlement` | `settlement_id_param`, `user_id_param` | Idempotently confirm as the authenticated receiver. |
| `reject_settlement` | `settlement_id_param` | Idempotently reject as the authenticated receiver. |

Every RPC derives authority from `auth.uid()`. Caller-supplied user IDs are
validated, never trusted. All public tables have row-level security enabled,
and privileged functions pin an empty search path.
