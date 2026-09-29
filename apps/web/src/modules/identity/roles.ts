/**
 * Rollenkonstanten ohne Abhaengigkeiten — absichtlich eine eigene Datei.
 *
 * `claims.ts` und `guards.ts` importieren `@/lib/supabase/server`. Wer diese
 * Konstante aus dem Modul-Barrel zoege, holte damit Servercode in ein
 * Client-Bundle. Client-Komponenten importieren deshalb direkt aus dieser
 * Datei, nicht aus `@/modules/identity`.
 */

/**
 * Die Rolle, die zwar einladbar ist, aber keine eigene Ansicht hat.
 *
 * Die RLS der Fachtabellen filtert ausschliesslich nach Mandant, nie nach
 * Rolle — `public.has_role()` dient nur `tenant_member` (0008) und der
 * Audit-Konsole (0050, 0035). Ein Eigentuemer im Verwalter-Dashboard saehe
 * deshalb jede WEG des Mandanten und koennte sie aendern. Bis es eine
 * Eigentuemersicht gibt, wird die Rolle vom Dashboard ferngehalten.
 *
 * `beirat` existiert im Enum (0002), ist aber nicht einladbar und damit nicht
 * erreichbar — bewusst nicht mitgesperrt.
 */
export const EIGENTUEMER_ROLLE = "eigentuemer";
