-- WEG-Verwaltung pgTAP regression contract for 0057 self-managed SaaS.

begin;

select plan(18);

-- ---------------------------------------------------------------------------
-- Catalog and hardening contract
-- ---------------------------------------------------------------------------

select has_table('public', 'tenant_subscription', 'subscription exists');
select has_table('public', 'tenant_invitation', 'invitation exists');

select ok(
  (
    select count(*)::int from pg_catalog.pg_class
    where oid in ('public.tenant_subscription'::regclass, 'public.tenant_invitation'::regclass)
      and relrowsecurity
  ) = 2
  and (
    select count(*)::int from pg_catalog.pg_class
    where oid in ('public.tenant_subscription'::regclass, 'public.tenant_invitation'::regclass)
      and relforcerowsecurity
  ) = 2,
  'subscription and invitation have RLS and FORCE RLS enabled'
);

select policies_are(
  'public', 'tenant_subscription', array['subscription_select_own_tenant'],
  'subscription exposes only its tenant-scoped SELECT policy'
);

select ok(
  not has_table_privilege('anon', 'public.tenant_subscription', 'INSERT')
  and not has_table_privilege('anon', 'public.tenant_subscription', 'UPDATE')
  and not has_table_privilege('anon', 'public.tenant_subscription', 'DELETE')
  and not has_table_privilege('anon', 'public.tenant_invitation', 'INSERT')
  and not has_table_privilege('anon', 'public.tenant_invitation', 'UPDATE')
  and not has_table_privilege('anon', 'public.tenant_invitation', 'DELETE'),
  'anon has no direct SaaS writes'
);

select ok(
  has_table_privilege('authenticated', 'public.tenant_subscription', 'SELECT')
  and not has_table_privilege('authenticated', 'public.tenant_subscription', 'INSERT')
  and not has_table_privilege('authenticated', 'public.tenant_subscription', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.tenant_subscription', 'DELETE')
  and has_table_privilege('authenticated', 'public.tenant_invitation', 'SELECT')
  and not has_table_privilege('authenticated', 'public.tenant_invitation', 'INSERT')
  and not has_table_privilege('authenticated', 'public.tenant_invitation', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.tenant_invitation', 'DELETE'),
  'authenticated users have read-only direct SaaS table access'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_index as index_def
    where index_def.indexrelid = 'public.tenant_invitation_one_open_email_idx'::regclass
      and lower(pg_catalog.pg_get_expr(index_def.indpred, index_def.indrelid)) like '%accepted_at is null%'
      and lower(pg_catalog.pg_get_expr(index_def.indpred, index_def.indrelid)) like '%revoked_at is null%'
  ),
  'only one open invitation can exist per tenant and email'
);

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.create_self_managed_weg_trial(text,text,jsonb,integer,text)',
      'public.create_tenant_invitation(text,text,bytea,timestamp with time zone)',
      'public.accept_tenant_invitation(bytea,text,text)',
      'public.tg_prevent_last_tenant_admin()'
    ]) as expected(regprocedure_name)
    where to_regprocedure(expected.regprocedure_name) is not null
  ),
  4,
  'all self-managed SaaS functions exist'
);

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.create_self_managed_weg_trial(text,text,jsonb,integer,text)',
      'public.create_tenant_invitation(text,text,bytea,timestamp with time zone)',
      'public.accept_tenant_invitation(bytea,text,text)',
      'public.tg_prevent_last_tenant_admin()'
    ]) as expected(regprocedure_name)
    join pg_catalog.pg_proc as procedure_def on procedure_def.oid = to_regprocedure(expected.regprocedure_name)
    where procedure_def.prosecdef
  ),
  4,
  'all SaaS functions are SECURITY DEFINER'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.create_self_managed_weg_trial(text,text,jsonb,integer,text)',
      'public.create_tenant_invitation(text,text,bytea,timestamp with time zone)',
      'public.accept_tenant_invitation(bytea,text,text)',
      'public.tg_prevent_last_tenant_admin()'
    ]) as expected(regprocedure_name)
    join pg_catalog.pg_proc as procedure_def on procedure_def.oid = to_regprocedure(expected.regprocedure_name)
    where not exists (
      select 1 from unnest(coalesce(procedure_def.proconfig, array[]::text[])) as config(value)
      where config.value in ('search_path=', 'search_path=""')
    )
  ),
  'all SaaS functions pin an empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.create_self_managed_weg_trial(text,text,jsonb,integer,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_tenant_invitation(text,text,bytea,timestamp with time zone)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_tenant_invitation(bytea,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.create_self_managed_weg_trial(text,text,jsonb,integer,text)', 'execute')
  and not has_function_privilege('anon', 'public.create_tenant_invitation(text,text,bytea,timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.accept_tenant_invitation(bytea,text,text)', 'execute'),
  'only authenticated users can call public SaaS RPCs'
);

select ok(
  (select prosrc from pg_catalog.pg_proc where oid = 'audit_writer.tg_emit_saas_audit_event()'::regprocedure)
    like '%- ''token_hash''%'
  and (select prosrc from pg_catalog.pg_proc where oid = 'audit_writer.tg_emit_saas_audit_event()'::regprocedure)
    like '%- ''provider_customer_id''%'
  and (select prosrc from pg_catalog.pg_proc where oid = 'audit_writer.tg_emit_saas_audit_event()'::regprocedure)
    like '%- ''provider_subscription_id''%',
  'SaaS audit emitter redacts tokens and provider references'
);

-- ---------------------------------------------------------------------------
-- Runtime security and atomicity contract
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111157',
    'email', 'founder@example.test',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

select lives_ok(
  $$select * from public.create_self_managed_weg_trial(
    'Hausgemeinschaft Muster',
    'WEG Musterstraße 1',
    '{"strasse":"Musterstraße 1","plz":"10115","ort":"Berlin"}'::jsonb,
    3,
    'start'
  )$$,
  'an authenticated user can atomically create a valid 30-day start trial'
);

reset role;

select is(
  (
    select count(*)::int
    from public.tenant_subscription as subscription
    join public.tenant_member as member on member.tenant_id = subscription.tenant_id
    where member.user_id = '11111111-1111-4111-8111-111111111157'::uuid
      and member.role = 'tenant_admin'
      and member.is_founding_admin
      and subscription.plan = 'start'
      and subscription.status = 'trial'
      and subscription.unit_count = 3
      and subscription.trial_ends_at - subscription.trial_started_at = interval '30 days'
  ),
  1,
  'trial creation persists exactly one founding admin and matching subscription'
);

select throws_ok(
  $$update public.tenant_member
      set role = 'eigentuemer'
    where user_id = '11111111-1111-4111-8111-111111111157'::uuid$$,
  '42501',
  'last tenant admin cannot be removed',
  'the only tenant admin cannot be demoted'
);

select set_config(
  'app.test_saas_tenant_id',
  (
    select tenant_id::text from public.tenant_member
    where user_id = '11111111-1111-4111-8111-111111111157'::uuid
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111157',
    'email', 'founder@example.test',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('app.test_saas_tenant_id', true),
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select lives_ok(
  $$select public.create_tenant_invitation(
      'INVITED@EXAMPLE.TEST',
      'eigentuemer',
      digest('invitation-token', 'sha256')
    )$$,
  'tenant_admin can create an email-normalized invitation through the RPC'
);

select lives_ok(
  $$select public.create_tenant_invitation(
      'invited@example.test',
      'eigentuemer',
      digest('second-invitation-token', 'sha256')
    )$$,
  'a replacement invitation revokes the previous open invitation'
);

reset role;

select is(
  (
    select count(*)::int from public.tenant_invitation as invitation
    where invitation.email = 'invited@example.test'
      and invitation.accepted_at is null
      and invitation.revoked_at is null
  ),
  1,
  'replacing an invitation leaves exactly one open invitation per tenant and email'
);

select * from finish();

rollback;
