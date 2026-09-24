-- WEG-Verwaltung migration 0070: Bucket-Grenze an die Upload-Grenze angleichen.
--
-- Zweck:
--   0015 setzte file_size_limit auf 100 MB. Die Web-App laedt ueber eine
--   Server Action hoch, und deren Body ist auf 10 MB begrenzt. Zwei
--   verschiedene Grenzen bedeuten zwei verschiedene Fehlermeldungen fuer
--   dieselbe Ursache — und eine Datei zwischen 10 und 100 MB scheitert an der
--   App, obwohl der Bucket sie erlauben wuerde.
--
-- Betroffene Tabellen:
--   storage.buckets (nur der Wert fuer weg-docs).
--
-- RLS-Auswirkung:
--   keine.
--
-- Teststrategie:
--   Teil des 0069-Vertrags waere falsch (andere Migration); hier genuegt der
--   Migrations-Texttest in apps/web/src/lib/supabase/__tests__.
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix: neue Migration mit anderem Wert.

update storage.buckets
   set file_size_limit = 10485760          -- 10 MB, wie serverActions.bodySizeLimit
 where id = 'weg-docs';
