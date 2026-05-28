-- WEG-Verwaltung migration 0010: RAG embedding layer (pgvector).
-- See docs/04-ai-architecture.md § 4.5.
--
-- Lays down the pgvector embedding storage for German legal/admin
-- text (Beschluss-Sammlung, Vorjahres-Protokolle, WEG-Dokumente).
-- Schema follows the § 4.5 sketch verbatim: vector(1024) for bge-m3,
-- HASH partitioning by tenant_id, HNSW index with m=16,
-- ef_construction=128. Hybrid retrieval (FTS + dense + RRF) is
-- application-side; this migration only ships the storage + indexes.
--
-- pgvector 0.8 iterative-scan setting is documented but not enforced
-- in SQL (it's a session/runtime GUC) -- see retrieve.py.

-- ---------------------------------------------------------------------------
-- Extension
-- ---------------------------------------------------------------------------

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- public.embedding -- HASH PARTITIONED BY tenant_id (§ 4.5).
-- ---------------------------------------------------------------------------
--
-- Schema mirrors the § 4.5 SQL sketch verbatim. Two project-wide conventions
-- are layered on top:
--   1. PK is composite (tenant_id, id) -- Postgres requires the partition key
--      to be part of every UNIQUE / PRIMARY KEY constraint on a partitioned
--      table. This also doubles as the composite-FK target for any future
--      child rows (§ 3.4 L3 / composite-FK pattern).
--   2. heading_path is stored separately from chunk_text. § 4.5 prepends it
--      at retrieval time ("Hausordnung > §4 Lärmschutz: <chunk>") so the
--      embedding represents the chunk in its structural context without
--      polluting the FTS path -- the BM25 side uses raw chunk_text via
--      to_tsvector('german', chunk_text) and would otherwise double-count
--      the heading tokens.

create table public.embedding (
  id            uuid not null default gen_random_uuid(),
  tenant_id     uuid not null,
  weg_id        uuid,
  doc_typ       text not null check (doc_typ in ('beschluss','protokoll','doku')),
  chunk_text    text not null,
  heading_path  text,                -- § 4.5: prepended at retrieval time, stored separately
  embedding     vector(1024) not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  -- Composite FK to weg (only enforced when weg_id IS NOT NULL -- NULL is
  -- allowed for tenant-global doc_typ='doku' entries that aren't WEG-bound).
  -- Postgres' MATCH SIMPLE (default) skips the FK check when any referencing
  -- column is NULL, so a single composite FK covers both shapes.
  constraint embedding_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete cascade
) partition by hash (tenant_id);

comment on table public.embedding is
  'pgvector embedding storage for RAG (§ 4.5). HASH-partitioned by tenant_id; '
  'HNSW index on parent propagates to partitions. bge-m3 = vector(1024).';

comment on column public.embedding.heading_path is
  '§ 4.5 heading-path prefix (e.g. "Hausordnung > §4 Lärmschutz"). Prepended at '
  'retrieval time, not at embedding/FTS time -- see retrieve.py.';

comment on column public.embedding.doc_typ is
  '§ 4.5 retrieval surface: beschluss | protokoll | doku. Drives partition pruning '
  'predicates and reranker weighting in retrieve.py.';

-- ---------------------------------------------------------------------------
-- Partition stub -- one hash partition of modulus 1.
-- ---------------------------------------------------------------------------
--
-- Rotation pattern for the next migration:
--   * Start with N=1 (this partition) while tenant count is small.
--   * Split into N=8 (or N=16) once any single tenant exceeds ~100k chunks
--     OR total chunk count crosses ~500k. Postgres cannot ALTER a hash
--     modulus in place -- the rotation migration must:
--       1. CREATE TABLE embedding_new ... PARTITION BY HASH (tenant_id);
--       2. CREATE TABLE embedding_p0..embedding_pN-1 PARTITION OF embedding_new
--          FOR VALUES WITH (modulus N, remainder i);
--       3. INSERT INTO embedding_new SELECT * FROM embedding;
--       4. Swap names + rebuild HNSW on the new parent.
--   * Large single tenants (>1M chunks) get a dedicated partition via
--     LIST-of-hashed-tenant_id sub-partitioning instead -- one HNSW index
--     per noisy neighbour stays in shared_buffers (§ 4.5 perf note).

create table public.embedding_p0
  partition of public.embedding
  for values with (modulus 1, remainder 0);

comment on table public.embedding_p0 is
  'Initial hash partition (modulus 1, remainder 0). Rotation plan in 0010 header.';

-- ---------------------------------------------------------------------------
-- HNSW index on the parent -- Postgres propagates to all partitions.
-- ---------------------------------------------------------------------------
--
-- Parameters per § 4.5: m=16, ef_construction=128. ef_search is a runtime GUC
-- (tune 40-100), set per session in retrieve.py -- not here, because the
-- right value depends on the use-case (frist-scan can afford lower recall,
-- beschluss-prüfung needs higher).

create index embedding_hnsw on public.embedding
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 128);

-- ---------------------------------------------------------------------------
-- BM25 / FTS index for the sparse hybrid path (§ 4.5).
-- ---------------------------------------------------------------------------
--
-- Postgres' built-in german dictionary stems aggressively
-- (Eigentümerversammlung -> eigentum). § 4.5 footgun #1: NEVER share
-- preprocessing with the embedding side -- BM25 and dense must stay
-- independent and get fused via RRF in retrieve.py.

create index embedding_fts_de on public.embedding
  using gin (to_tsvector('german', chunk_text));

-- ---------------------------------------------------------------------------
-- Secondary B-tree for partition-internal filtering (weg_id, doc_typ).
-- ---------------------------------------------------------------------------
--
-- The HNSW scan returns top-k by cosine distance; RLS + (weg_id, doc_typ)
-- predicates are then applied. pgvector 0.8 iterative_scan needs these
-- predicate columns to be cheap to evaluate or it has to re-fetch heavily.

create index embedding_weg_doc_idx
  on public.embedding (tenant_id, weg_id, doc_typ);

-- ---------------------------------------------------------------------------
-- RLS -- § 3.4 pattern, identical to every other tenant-scoped table in 0008.
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
-- Runtime considerations (see retrieve.py):
--   SET hnsw.iterative_scan = 'relaxed_order';   -- pgvector 0.8, fixes over-filtering
--   SET hnsw.ef_search = 60;                     -- tune 40-100
--
-- Honest unknown (§ 4.11): bge-m3 self-host cost on Fly.io Frankfurt
-- not yet profiled. Embedding code (apps/agent/app/rag/embed.py) is
-- lazy-init + opt-in via `[project.optional-dependencies] rag`.
-- ---------------------------------------------------------------------------
