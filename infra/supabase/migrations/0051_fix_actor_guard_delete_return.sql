-- WEG-Verwaltung migration 0051: preserve DELETE rows in actor_type guard.
--
-- audit_writer.assert_not_agent_write() is attached to BEFORE DELETE triggers
-- on vote and resolution. Returning NEW from a DELETE trigger evaluates to NULL
-- and silently cancels the delete. Keep the agent-write guard, but return OLD
-- for DELETE operations so legitimate human/admin deletes can proceed to the
-- table-specific lifecycle guards.

create or replace function audit_writer.assert_not_agent_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  v_actor := coalesce(current_setting('app.actor_type', true), 'user');
  if v_actor = 'agent' then
    raise exception 'Invariante 3 violation: actor_type=agent cannot write to %', tg_table_name
      using errcode = '42501',
            hint = 'Agents must use the agent_suggestion table. See docs/01 §4.6 Invariante 3.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function audit_writer.assert_not_agent_write() from public;
grant execute on function audit_writer.assert_not_agent_write() to authenticated;

comment on function audit_writer.assert_not_agent_write() is
  'Invariante 3 (§ 4.6): block writes when app.actor_type GUC = ''agent''; returns OLD for DELETE so non-agent deletes are not silently cancelled.';
