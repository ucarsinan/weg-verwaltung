-- WEG-Verwaltung pgTAP regression contract for 0058 audit_writer vault decrypt grant.

begin;

select plan(3);

select ok(
  has_function_privilege(
    'audit_writer',
    'vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea)',
    'execute'
  ),
  'audit_writer can execute vault._crypto_aead_det_decrypt'
);

-- End-to-end: a fresh public.tenant insert triggers the audit chain
-- (audit_writer.tg_emit_tenant_audit_event -> audit_event_before_insert ->
-- hash_audit_event_v2 -> vault.decrypted_secrets) and must not raise.
select lives_ok(
  $$insert into public.tenant (id, name)
    values ('11111111-2222-4333-8444-000000000058'::uuid, '0058 Diag Tenant')$$,
  'an audited public.tenant insert succeeds once the vault decrypt grant is in place'
);

select is(
  (
    select count(*)::int from public.audit_event
    where tenant_id = '11111111-2222-4333-8444-000000000058'::uuid
      and entity_typ = 'tenant'
      and action = 'insert'
      and octet_length(row_hash) = 32
  ),
  1,
  'the tenant insert produces exactly one audit_event row with a 32-byte row_hash'
);

select * from finish();

rollback;
