-- WEG-Verwaltung migration 0015: Dokumente-Modul.
-- See docs/01-system-design.md § 4.1 (modules/dokumente) and docs/03-security-model.md § 3.4.
--
-- Two tables + a private Supabase Storage bucket:
--   - public.document            — metadata (1 row per logical document)
--   - public.document_version    — append-only versions (N rows per document)
--   - storage bucket 'weg-docs'  — private, signed-URL access only
--
-- Storage path schema: <tenant_id>/<weg_id>/<doc_typ>/<uuid>.<ext>
-- The leading tenant_id segment is what the storage.objects RLS policy
-- matches against (storage.foldername(name)[1]), keeping the bucket
-- mandant-isolated even if the DB row is missing.
--
-- Versioning: document.current_version_id pins the "latest" version pointer.
-- document_version is append-only via trigger (analog 0006 audit_event,
-- 0005 beschluss_sammlung_entry). Each upload writes a new version row;
-- existing rows never change → forensic chain of custody for legal proof.
--
-- doc_typ values match 0010 embedding (`beschluss | protokoll | doku`)
-- so the same retrieval surface covers chunks from any document type.

-- ---------------------------------------------------------------------------
-- public.document — logical document
-- ---------------------------------------------------------------------------

create table if not exists public.document (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default public.tenant_id()
                      references public.tenant(id) on delete restrict,
  weg_id              uuid not null,
  doc_typ             text not null
                      check (doc_typ in ('beschluss','protokoll','doku')),
  titel               text not null,
  current_version_id  uuid,                          -- FK added after document_version exists
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,                   -- soft delete; hard delete blocked by policy
  unique (tenant_id, id),                            -- composite-FK target
  constraint document_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.document is
  'Logical document grouping (e.g. one Protokoll). Actual content lives in public.document_version + Storage bucket weg-docs.';

comment on column public.document.current_version_id is
  'Pointer to the latest non-superseded version. Updated by tg_document_set_current_version on every document_version INSERT.';

comment on column public.document.deleted_at is
  'Soft delete only. Hard delete is blocked at policy level so legal evidence (WEG § 24 Abs. 7) survives.';

create index if not exists document_tenant_weg_idx
  on public.document (tenant_id, weg_id);

create index if not exists document_typ_idx
  on public.document (tenant_id, weg_id, doc_typ);

-- ---------------------------------------------------------------------------
-- public.document_version — append-only version log
-- ---------------------------------------------------------------------------

create table if not exists public.document_version (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default public.tenant_id(),
  document_id         uuid not null,
  version_no          int not null check (version_no >= 1),
  storage_path        text not null,                 -- <tenant_id>/<weg_id>/<doc_typ>/<uuid>.<ext>
  mime_type           text not null,
  file_size_bytes     bigint not null check (file_size_bytes > 0),
  sha256              bytea not null check (octet_length(sha256) = 32),
  uploaded_at         timestamptz not null default now(),
  uploaded_by         uuid references auth.users(id),
  unique (tenant_id, id),
  unique (tenant_id, document_id, version_no),
  constraint document_version_document_fk
    foreign key (tenant_id, document_id)
    references public.document(tenant_id, id)
    on delete restrict
);

comment on table public.document_version is
  'Append-only version log. UPDATE/DELETE blocked by trigger tg_document_version_append_only. sha256 is the content checksum, file_size_bytes the storage object size — both forensic anchors.';

create index if not exists document_version_document_idx
  on public.document_version (tenant_id, document_id, version_no desc);

-- ---------------------------------------------------------------------------
-- Now add the document.current_version_id FK (deferred because of circular ref)
-- ---------------------------------------------------------------------------

alter table public.document
  add constraint document_current_version_fk
  foreign key (tenant_id, current_version_id)
  references public.document_version(tenant_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- Trigger: append-only on document_version (analog 0005 beschluss_sammlung)
-- ---------------------------------------------------------------------------

create or replace function public.tg_document_version_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'document_version is append-only — UPDATE/DELETE rejected. Upload a new version instead.'
    using errcode = 'P0001';
end;
$$;

comment on function public.tg_document_version_append_only() is
  'Block UPDATE/DELETE on document_version. Append-only guarantees forensic continuity.';

create trigger document_version_no_update
  before update on public.document_version
  for each row execute function public.tg_document_version_append_only();

create trigger document_version_no_delete
  before delete on public.document_version
  for each row execute function public.tg_document_version_append_only();

-- ---------------------------------------------------------------------------
-- Trigger: maintain document.current_version_id on INSERT into document_version
-- ---------------------------------------------------------------------------

create or replace function public.tg_document_set_current_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only advance current_version_id if this insert is the highest version_no
  -- so far. Backfilling an older version (rare but possible) does not change
  -- the head pointer.
  update public.document
     set current_version_id = new.id,
         updated_at         = now()
   where tenant_id = new.tenant_id
     and id        = new.document_id
     and (
       current_version_id is null
       or new.version_no > (
         select version_no from public.document_version
          where tenant_id = new.tenant_id and id = (
            select current_version_id from public.document
             where tenant_id = new.tenant_id and id = new.document_id
          )
       )
     );
  return new;
end;
$$;

revoke all on function public.tg_document_set_current_version() from public;
-- Supabase auto-grants execute on public.* functions to anon + authenticated by
-- default; revoke explicitly so the SECURITY DEFINER trigger cannot be invoked
-- as an RPC via /rest/v1/rpc/tg_document_set_current_version. The trigger only
-- needs to fire from the document_version INSERT path, not from API callers.
revoke execute on function public.tg_document_set_current_version() from anon, authenticated;

comment on function public.tg_document_set_current_version() is
  'AFTER INSERT on document_version: bump document.current_version_id to the new row when its version_no is the highest. SECURITY DEFINER so the trigger can write document even when caller has only INSERT on document_version.';

create trigger document_version_set_current
  after insert on public.document_version
  for each row execute function public.tg_document_set_current_version();

-- ---------------------------------------------------------------------------
-- RLS — standard 4-policy block per § 3.4 + append-only specials
-- ---------------------------------------------------------------------------

alter table public.document        enable row level security;
alter table public.document        force  row level security;
alter table public.document_version enable row level security;
alter table public.document_version force  row level security;

revoke all on public.document         from public;
revoke all on public.document_version from public;

grant select, insert, update on public.document to authenticated;
grant select, insert         on public.document_version to authenticated;
-- UPDATE/DELETE on document_version are blocked by the append-only trigger;
-- no policy needed — even WITH CHECK matches, the trigger rejects.

-- public.document policies
create policy document_select_own_tenant
  on public.document for select to authenticated
  using (tenant_id = (select public.tenant_id()) and deleted_at is null);

create policy document_insert_own_tenant
  on public.document for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

create policy document_update_own_tenant
  on public.document for update to authenticated
  using (tenant_id = (select public.tenant_id()))
  with check (tenant_id = (select public.tenant_id()));

-- No DELETE policy → hard delete blocked. Use UPDATE deleted_at = now() (soft delete).

-- public.document_version policies
create policy document_version_select_own_tenant
  on public.document_version for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy document_version_insert_own_tenant
  on public.document_version for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

-- ---------------------------------------------------------------------------
-- Storage bucket: weg-docs (private)
-- ---------------------------------------------------------------------------
--
-- Bucket is private (public=false): every read goes through a signed URL
-- issued by the server after the RLS predicate matches. Upload uses the
-- same predicate for INSERT.
--
-- File size limit 100 MB covers Wirtschaftsplan PDFs + scanned protocols.
-- Allowed MIME types restrict to actually-useful document formats; widen
-- in a follow-up migration if the spec evolves.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weg-docs',
  'weg-docs',
  false,
  104857600,                              -- 100 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'         -- .xlsx
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS — keyed off the leading <tenant_id> path segment.
-- storage.foldername(name) returns the path components as text[].
-- (storage.foldername('a/b/c.pdf'))[1] = 'a'.

create policy "weg-docs select own tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'weg-docs'
    and (storage.foldername(name))[1]::uuid = (select public.tenant_id())
  );

create policy "weg-docs insert own tenant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'weg-docs'
    and (storage.foldername(name))[1]::uuid = (select public.tenant_id())
  );

-- Update intentionally not granted on storage.objects for weg-docs:
-- new versions = new object paths, never overwrite. This makes signed-URL
-- caching safe (URL → immutable bytes) and preserves the forensic chain.

-- Delete intentionally not granted on storage.objects for weg-docs:
-- legal retention (WEG-Recht §28 Abs. 6, 10 Jahre) lives operationally;
-- if a real delete is ever needed, it goes through a SECURITY DEFINER
-- admin function with audit log entry. No app-side path.
