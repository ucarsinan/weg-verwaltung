-- WEG-Verwaltung migration 0027: Grants damit audit_writer (SECURITY
-- DEFINER aus 0026) auth.uid() aufrufen darf.
--
-- Symptom in 0026 ohne diese Grants: jede INSERT in eine instrumentierte
-- Business-Table schlug mit SQLSTATE 42501 fehl, weil der AFTER-Trigger
-- als audit_writer auth.uid() aufruft, audit_writer aber kein EXECUTE
-- auf auth.uid() besitzt.
--
-- auth.uid() ist `security invoker` und prüft EXECUTE gegen den
-- CURRENT_USER — bei SECURITY DEFINER also gegen den Function-Owner
-- (audit_writer), nicht gegen den ursprünglichen authenticated-Role.
-- Daher der explizite Grant.

grant execute on function auth.uid() to audit_writer;

-- Defensive: audit_writer braucht USAGE auf auth, um Funktionen
-- darin überhaupt qualifiziert aufzurufen.
grant usage on schema auth to audit_writer;
