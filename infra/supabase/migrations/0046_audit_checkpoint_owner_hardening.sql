-- WEG-Verwaltung migration 0046: harden audit repair checkpoint ownership.
--
-- 0045 restored the forward verifier, but owning the checkpoint table by the
-- SECURITY DEFINER runtime role leaves audit_writer with implicit owner powers
-- on the repair artifact. Keep audit_writer to SELECT/INSERT only. This does
-- not modify public.audit_event rows.

begin;

alter table audit_writer.audit_chain_repair_checkpoint owner to postgres;

revoke all on audit_writer.audit_chain_repair_checkpoint
  from public, anon, authenticated, service_role, audit_writer;

grant select, insert on audit_writer.audit_chain_repair_checkpoint to audit_writer;

comment on table audit_writer.audit_chain_repair_checkpoint is
  'Per-tenant forward checkpoint for audit-chain repair. Owned by postgres; audit_writer has SELECT/INSERT only. Historical audit_event rows are not rewritten.';

notify pgrst, 'reload schema';

commit;
