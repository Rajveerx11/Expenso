-- Personal create idempotency must be derived from authoritative, normalized
-- inputs. The former eight-argument RPC accepted a caller-selected digest,
-- allowing the same key/payload relationship to be misrepresented.
alter table public.personal_expenses
    add constraint personal_expenses_amount_finite
    check (amount <> 'NaN'::numeric);

create or replace function public.create_personal_expense(
    title_param text,
    amount_param numeric,
    category_param text,
    type_param text,
    note_param text,
    expense_date_param date,
    idempotency_key_param text
)
returns table(
    transaction_id uuid,
    transaction_title text,
    transaction_amount numeric,
    transaction_category text,
    transaction_type text,
    transaction_note text,
    transaction_source_group_expense_id uuid,
    transaction_expense_date date,
    transaction_created_at timestamptz,
    transaction_updated_at timestamptz,
    replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    computed_request_hash text;
begin
    computed_request_hash := encode(extensions.digest(
        jsonb_build_object(
            'title', trim(title_param),
            'amount', to_char(amount_param, 'FM9999999990.00'),
            'category', category_param,
            'type', type_param,
            'note', nullif(trim(note_param), ''),
            'expense_date', expense_date_param
        )::text,
        'sha256'
    ), 'hex');

    return query
    select *
    from public.create_personal_expense(
        title_param,
        amount_param,
        category_param,
        type_param,
        note_param,
        expense_date_param,
        idempotency_key_param,
        computed_request_hash
    );
end;
$$;

revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text, text)
    from public, anon, authenticated;
revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text)
    from public, anon, authenticated;
grant execute on function public.create_personal_expense(text, numeric, text, text, text, date, text)
    to authenticated;
