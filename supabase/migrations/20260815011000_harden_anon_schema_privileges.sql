-- Older Supabase projects can have default privileges that grant new public
-- functions and tables directly to anon. PUBLIC revocation does not remove
-- those direct grants, so remove them explicitly for every Expenso contract.
do $$
declare
    target_function regprocedure;
begin
    for target_function in
        select procedure.oid::regprocedure
        from pg_proc as procedure
        join pg_namespace as namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = any(array[
              'add_group_member_by_email',
              'attach_group_image',
              'can_delete_group_safely',
              'check_group_member_lookup_rate_limit',
              'claim_notification_delivery',
              'claim_web_push_deliveries',
              'complete_web_push_delivery',
              'confirm_group_settlement_web',
              'confirm_settlement',
              'create_group_expense',
              'create_group_expense_web',
              'create_group_settlement_web',
              'create_group_with_admin',
              'create_personal_expense',
              'create_settlement',
              'delete_group_expense',
              'delete_group_expense_web',
              'delete_group_safely',
              'delete_personal_expense',
              'disable_web_push_subscription',
              'get_dashboard_summary',
              'get_group_balances',
              'get_group_expense_web',
              'get_group_member_directory',
              'get_group_settlement_web',
              'get_group_summary',
              'get_personal_expense_analytics',
              'handle_new_user',
              'list_group_balances_web',
              'list_group_expenses_web',
              'list_group_members',
              'list_group_settlements_web',
              'list_group_summaries',
              'list_notifications_web',
              'list_personal_expenses',
              'list_user_groups',
              'mark_all_notifications_read_web',
              'mark_notification_read_web',
              'mark_notifications_read',
              'recalculate_balance',
              'register_push_token',
              'reject_group_settlement_web',
              'reject_settlement',
              'remove_group_member_safely',
              'unregister_push_token',
              'update_group_settings',
              'update_personal_expense',
              'upsert_web_push_subscription'
          ])
    loop
        execute format('revoke execute on function %s from anon', target_function);
    end loop;
end;
$$;

revoke all privileges on table
    public.expense_splits,
    public.group_expenses,
    public.group_members,
    public.groups,
    public.notification_deliveries,
    public.notifications,
    public.payment_confirmations,
    public.personal_expenses,
    public.profiles,
    public.settlements,
    public.user_fcm_tokens,
    public.web_push_notification_deliveries,
    public.web_push_subscriptions
from anon;

-- This is the only intentional pre-auth database call until the final
-- versioned readiness marker is installed by the next migration.
grant execute on function public.check_auth_rate_limit(text, text, text) to anon;
