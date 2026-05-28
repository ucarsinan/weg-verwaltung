/**
 * Hand-written Supabase Database type stub.
 *
 * In production this file will be regenerated via:
 *   pnpm dlx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * For now we hand-type the tables we read from app code, to unblock the
 * /wegs/* surfaces. Keep this in sync with the migrations under
 * infra/supabase/migrations/:
 *   - weg     → 0003_weg_domain.sql
 *   - meeting → 0004_versammlung.sql
 */

// Domain enums for the meeting table are modeled in SQL as CHECK constraints
// (see 0004_versammlung.sql) rather than Postgres ENUM types — supabase
// gen types will emit them as string unions in the same shape we declare here.
export type MeetingModus = "praesenz" | "hybrid" | "virtuell" | "umlauf";
export type MeetingStatus =
  | "entwurf"
  | "eingeladen"
  | "laufend"
  | "beendet"
  | "abgesagt";

export type Database = {
  public: {
    Tables: {
      weg: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          adresse: string | null;
          amtsgericht: string | null;
          grundbuch_blatt: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          name: string;
          adresse?: string | null;
          amtsgericht?: string | null;
          grundbuch_blatt?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          adresse?: string | null;
          amtsgericht?: string | null;
          grundbuch_blatt?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      meeting: {
        Row: {
          id: string;
          tenant_id: string;
          weg_id: string;
          modus: MeetingModus;
          status: MeetingStatus;
          // Migration 0004 declares termin_von / termin_bis nullable
          // (no NOT NULL constraint). Reflected here as `string | null`.
          termin_von: string | null;
          termin_bis: string | null;
          einladung_versand_am: string | null;
          // GENERATED ALWAYS AS … STORED — read-only from app code.
          frist_einladung_ok: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          weg_id: string;
          modus: MeetingModus;
          status?: MeetingStatus;
          termin_von?: string | null;
          termin_bis?: string | null;
          einladung_versand_am?: string | null;
          // Generated column — never inserted by app code.
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          weg_id?: string;
          modus?: MeetingModus;
          status?: MeetingStatus;
          termin_von?: string | null;
          termin_bis?: string | null;
          einladung_versand_am?: string | null;
          // Generated column — never updated by app code.
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
