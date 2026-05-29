-- WEG-Verwaltung migration 0019: lock down search_path on legacy public.* helpers.
--
-- Backfill for the `function_search_path_mutable` advisor finding on four
-- functions that predate the search-path hygiene introduced in 0015. Without
-- an explicit `SET search_path` clause, a role with CREATE on the search-path
-- schemas could shadow `auth.jwt()` (or any other reference) and hijack the
-- function's body when called as SECURITY DEFINER or from RLS predicates.
--
-- All four bodies use either fully-qualified references (auth.jwt()) or only
-- pg_catalog builtins (RAISE, nullif, ::uuid), so an empty search_path is safe.
-- The source-of-truth migrations (0001, 0005, 0006) have the same SET clause
-- inline so fresh environments don't depend on this backfill.

alter function public.has_role(text)
  set search_path = '';

alter function public.tenant_id()
  set search_path = '';

alter function public.tg_beschluss_sammlung_append_only()
  set search_path = '';

alter function public.tg_audit_event_immutable()
  set search_path = '';
