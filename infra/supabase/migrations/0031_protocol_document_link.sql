-- WEG-Verwaltung migration 0031: add nullable document_id FK to protocol.
-- Links a finalized protocol to its PDF artifact in the Dokumente-Modul
-- (0015). Set by signProtokoll Server Action after PDF upload.
-- Non-breaking: nullable, no backfill needed.

alter table public.protocol
  add column if not exists document_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'protocol_document_fk'
      and conrelid = 'public.protocol'::regclass
  ) then
    alter table public.protocol
      add constraint protocol_document_fk
        foreign key (tenant_id, document_id)
        references public.document(tenant_id, id)
        on delete set null;
  end if;
end
$$;

comment on column public.protocol.document_id is
  'FK to public.document (doc_typ=protokoll). Set by signProtokoll after PDF upload. NULL until signed.';
