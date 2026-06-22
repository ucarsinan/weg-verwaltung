-- WEG-Verwaltung migration 0048: NULL-safe Wirtschaftsplan lifecycle guard.
--
-- 0047 introduced app.wirtschaftsplan_lifecycle_manager as a transaction-local
-- guard flag for lifecycle RPCs. Direct DML without that GUC must fail closed.

create or replace function public.tg_wirtschaftsplan_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager text;
begin
  v_manager := nullif(pg_catalog.current_setting('app.wirtschaftsplan_lifecycle_manager', true), '');

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'entwurf';
    end if;

    if new.status <> 'entwurf' and v_manager is distinct from '1' then
      raise exception 'Wirtschaftsplan must be inserted as entwurf.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.aktiviert_am is distinct from new.aktiviert_am
    or old.abgeloest_am is distinct from new.abgeloest_am
    or old.archiviert_am is distinct from new.archiviert_am
  ) and v_manager is distinct from '1' then
    raise exception 'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_lifecycle_guard() from public;

comment on function public.tg_wirtschaftsplan_lifecycle_guard() is
  'Blocks direct Wirtschaftsplan lifecycle DML unless a lifecycle RPC sets app.wirtschaftsplan_lifecycle_manager=1. Missing or empty GUC fails closed.';

notify pgrst, 'reload schema';
