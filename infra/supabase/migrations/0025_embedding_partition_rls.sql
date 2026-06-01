-- WEG-Verwaltung migration 0025: re-enable RLS on the embedding_p0 partition.
-- Follow-up fix for migration 0024 (vector schema move).
--
-- Migration 0014_partition_rls.sql back-filled ENABLE+FORCE ROW LEVEL SECURITY
-- on all existing partitions of public.audit_event and public.embedding because
-- Postgres does not propagate the parent's RLS-enabled state to child
-- partitions. The vector-extension move in 0024 dropped and recreated
-- public.embedding (and embedding_p0), losing the 0014 back-fill — Supabase's
-- linter immediately re-flagged embedding_p0 with the ERROR-level
-- `rls_disabled_in_public` advisor.
--
-- This migration restores the 0014 invariant for the single existing
-- partition. The original 0024 should have included these two statements
-- inline; future repartitioning per the 0010 header rotation plan must
-- include ENABLE+FORCE on each new embedding_p<i> created.

alter table public.embedding_p0 enable row level security;
alter table public.embedding_p0 force row level security;
