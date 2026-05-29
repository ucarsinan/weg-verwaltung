-- WEG-Verwaltung migration 0016: revoke trigger-function RPC exposure (backfill).
--
-- 0015 declared `public.tg_document_set_current_version()` as SECURITY DEFINER
-- (needed so the AFTER INSERT trigger on document_version can update document
-- even when the caller only has INSERT on document_version). The migration
-- correctly REVOKEd from PUBLIC but Supabase's default grants left the
-- function callable as `/rest/v1/rpc/tg_document_set_current_version` by
-- both `anon` and `authenticated` — flagged by advisor
-- `anon_security_definer_function_executable`.
--
-- This migration backfills the explicit revoke against the already-applied
-- 0015. The source-of-truth in 0015 has been updated in the same change set
-- so fresh environments do not need this migration.

revoke execute on function public.tg_document_set_current_version() from anon, authenticated;
