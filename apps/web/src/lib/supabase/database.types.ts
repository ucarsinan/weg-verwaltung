/**
 * Hand-written Supabase Database type stub.
 *
 * In production this file will be regenerated via:
 *   pnpm dlx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * For now we hand-type the `weg` table only to unblock /wegs/page.tsx.
 * Keep this in sync with infra/supabase/migrations/0003_weg_domain.sql.
 */

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
