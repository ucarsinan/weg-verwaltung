-- WEG-Verwaltung migration 0024: move vector (pgvector) out of public into
-- extensions, and rebuild the public.embedding table on top of the new
-- extensions.vector type. Closes the last extension_in_public advisor.
--
-- The migration is destructive for the embedding table — it drops + rebuilds
-- the parent + partition + 3 indexes + RLS + 4 policies + FK to weg. This is
-- only safe because retrieve.py (apps/agent/app/rag/retrieve.py:129) still
-- returns [] — no production code writes to public.embedding yet. A DO-block
-- guard at the top aborts the migration if any row exists, defending against
-- a future commit that wires up the writer before this migration runs.
--
-- If the guard fires, do NOT remove it. Instead either:
--   a) snapshot the table to JSONB, run this migration, restore via
--      embedding::extensions.vector(1024) cast, OR
--   b) open a Supabase Support ticket to perform the privileged
--      ALTER EXTENSION vector SET SCHEMA extensions per the PostGIS escape
--      hatch (https://supabase.com/docs/guides/database/extensions/postgis#troubleshooting).
--
-- Rebuild parity: every clause below mirrors 0010_embedding_layer.sql verbatim
-- with `vector(1024)` → `extensions.vector(1024)` and `vector_cosine_ops` →
-- `extensions.vector_cosine_ops`. Distance operators (<=>, <#>, <->) resolve
-- through search_path so unqualified usage in retrieve.py keeps working.
-- ALTER EXTENSION ... SET SCHEMA fails Cloud-side with SQLSTATE 42501 (see
-- 0022 header) — DROP + CREATE as `postgres` is the working path.

begin;

-- ---------------------------------------------------------------------------
-- Pre-flight safety
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.embedding limit 1) then
    raise exception
      'public.embedding is not empty -- abort vector schema move. '
      'See 0024 header for snapshot/restore or Supabase Support path.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tear down: partition first, then parent (cascades indexes/RLS/policies/FK).
-- ---------------------------------------------------------------------------

drop table if exists public.embedding_p0;
drop table if exists public.embedding;

-- ---------------------------------------------------------------------------
-- Move the extension. CASCADE not needed -- table drop above removed the
-- only dependent object.
-- ---------------------------------------------------------------------------

drop extension if exists vector;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Rebuild public.embedding -- HASH PARTITIONED BY tenant_id (§ 4.5).
-- Same shape as 0010_embedding_layer.sql, but with the type fully qualified
-- to extensions.vector(1024) so the column does not depend on search_path.
-- ---------------------------------------------------------------------------

create table public.embedding (
  id            uuid not null default gen_random_uuid(),
  tenant_id     uuid not null,
  weg_id        uuid,
  doc_typ       text not null check (doc_typ in ('beschluss','protokoll','doku')),
  chunk_text    text not null,
  heading_path  text,
  embedding     extensions.vector(1024) not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint embedding_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete cascade
) partition by hash (tenant_id);

create table public.embedding_p0
  partition of public.embedding
  for values with (modulus 1, remainder 0);

-- ---------------------------------------------------------------------------
-- Indexes (HNSW + GIN/FTS + secondary B-tree).
-- ---------------------------------------------------------------------------

create index embedding_hnsw on public.embedding
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 128);

create index embedding_fts_de on public.embedding
  using gin (to_tsvector('german', chunk_text));

create index embedding_weg_doc_idx
  on public.embedding (tenant_id, weg_id, doc_typ);

-- ---------------------------------------------------------------------------
-- RLS -- identical to 0010 (uses auth.jwt() inline, predates the
-- public.tenant_id() helper consolidation).
-- ---------------------------------------------------------------------------

alter table public.embedding enable row level security;
alter table public.embedding force row level security;
revoke all on public.embedding from public;
grant select, insert, update, delete on public.embedding to authenticated;

create policy embedding_select_own_tenant
  on public.embedding for select to authenticated
  using (
    tenant_id = ((select auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

create policy embedding_insert_own_tenant
  on public.embedding for insert to authenticated
  with check (
    tenant_id = ((select auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

create policy embedding_update_own_tenant
  on public.embedding for update to authenticated
  using (
    tenant_id = ((select auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  )
  with check (
    tenant_id = ((select auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

create policy embedding_delete_own_tenant
  on public.embedding for delete to authenticated
  using (
    tenant_id = ((select auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
  );

-- ---------------------------------------------------------------------------
-- Comments (parity with 0010 + relocation note).
-- ---------------------------------------------------------------------------

comment on table public.embedding is
  'pgvector embedding storage for RAG (§ 4.5). HASH-partitioned by tenant_id; '
  'HNSW index on parent propagates to partitions. bge-m3 = vector(1024). '
  'Moved to extensions schema in 0024 -- column type is extensions.vector(1024).';

comment on table public.embedding_p0 is
  'Initial hash partition (modulus 1, remainder 0). Rotation plan in 0010 header.';

comment on column public.embedding.heading_path is
  '§ 4.5 heading-path prefix (e.g. "Hausordnung > §4 Lärmschutz"). Prepended at '
  'retrieval time, not at embedding/FTS time -- see retrieve.py.';

comment on column public.embedding.doc_typ is
  '§ 4.5 retrieval surface: beschluss | protokoll | doku. Drives partition pruning '
  'predicates and reranker weighting in retrieve.py.';

commit;
