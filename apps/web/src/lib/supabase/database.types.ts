/**
 * Hand-written Supabase Database type stub.
 *
 * In production this file will be regenerated via:
 *   pnpm dlx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * For now we hand-type the tables we read from app code. Keep this in sync
 * with the migrations under infra/supabase/migrations/:
 *   - weg, unit, person, ownership → 0003_weg_domain.sql
 *   - meeting, agenda_item, resolution, vote → 0004_versammlung.sql
 *   - beschluss_sammlung_entry, beschluss_anfechtung_event → 0005_beschluss_sammlung.sql
 */

// CHECK-constraint string unions — supabase gen types emits them in this shape.
export type MeetingModus = "praesenz" | "hybrid" | "virtuell" | "umlauf";
export type MeetingStatus =
  | "entwurf"
  | "eingeladen"
  | "laufend"
  | "beendet"
  | "abgesagt";

export type MehrheitsTyp =
  | "einfach"
  | "qualifiziert"
  | "doppelt_qualifiziert"
  | "allstimmig"
  | "vereinbarungs_aenderung";
export type Stimmprinzip = "kopf" | "wert" | "objekt";
export type ResolutionLegalState = "pending" | "contested" | "final" | "voided";
export type VoteWert = "ja" | "nein" | "enthaltung";
export type VoteQuelle = "praesenz" | "digital" | "umlauf";

export type AuditActorType = "user" | "agent" | "system";

export type AgentActorType = "agent" | "system";
export type AgentSuggestionStatus = "vorschlag" | "uebernommen" | "verworfen";

export type BeschlussSammlungTyp =
  | "positiv_beschluss"
  | "negativ_beschluss"
  | "umlaufbeschluss";

export type AnfechtungsStatus =
  | "keine"
  | "angefochten"
  | "unwirksam_erklaert";

export type AnfechtungsEventTyp =
  | "angefochten"
  | "zurueckgenommen"
  | "unwirksam_erklaert"
  | "bestaetigt";

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
          titel: string;
          modus: MeetingModus;
          status: MeetingStatus;
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
          titel: string;
          modus: MeetingModus;
          status?: MeetingStatus;
          termin_von?: string | null;
          termin_bis?: string | null;
          einladung_versand_am?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          weg_id?: string;
          titel?: string;
          modus?: MeetingModus;
          status?: MeetingStatus;
          termin_von?: string | null;
          termin_bis?: string | null;
          einladung_versand_am?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      agenda_item: {
        Row: {
          id: string;
          tenant_id: string;
          meeting_id: string;
          position: number;
          titel: string;
          beschreibung: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          meeting_id: string;
          position: number;
          titel: string;
          beschreibung?: string | null;
        };
        Update: {
          position?: number;
          titel?: string;
          beschreibung?: string | null;
        };
      };
      resolution: {
        Row: {
          id: string;
          tenant_id: string;
          meeting_id: string;
          agenda_item_id: string | null;
          text: string;
          mehrheits_typ: MehrheitsTyp;
          stimmprinzip: Stimmprinzip;
          legal_state: ResolutionLegalState;
          festgestellt_am: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          meeting_id: string;
          agenda_item_id?: string | null;
          text: string;
          mehrheits_typ: MehrheitsTyp;
          stimmprinzip: Stimmprinzip;
          legal_state?: ResolutionLegalState;
          festgestellt_am?: string | null;
        };
        Update: {
          text?: string;
          mehrheits_typ?: MehrheitsTyp;
          stimmprinzip?: Stimmprinzip;
          legal_state?: ResolutionLegalState;
          festgestellt_am?: string | null;
        };
      };
      vote: {
        Row: {
          id: string;
          tenant_id: string;
          resolution_id: string;
          ownership_id: string;
          wert: VoteWert;
          quelle: VoteQuelle;
          proxy_id: string | null;
          abgegeben_am: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          resolution_id: string;
          ownership_id: string;
          wert: VoteWert;
          quelle: VoteQuelle;
          proxy_id?: string | null;
          abgegeben_am?: string;
        };
        Update: {
          wert?: VoteWert;
          quelle?: VoteQuelle;
        };
      };
      unit: {
        Row: {
          id: string;
          tenant_id: string;
          weg_id: string;
          bezeichnung: string;
          mea_zaehler: number;
          mea_nenner: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          weg_id: string;
          bezeichnung: string;
          mea_zaehler: number;
          mea_nenner: number;
        };
        Update: {
          bezeichnung?: string;
          mea_zaehler?: number;
          mea_nenner?: number;
        };
      };
      person: {
        Row: {
          id: string;
          tenant_id: string;
          vorname: string;
          nachname: string;
          anschrift: string | null;
          email: string | null;
          telefon: string | null;
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          vorname: string;
          nachname: string;
          anschrift?: string | null;
          email?: string | null;
          telefon?: string | null;
          user_id?: string | null;
        };
        Update: {
          vorname?: string;
          nachname?: string;
          anschrift?: string | null;
          email?: string | null;
          telefon?: string | null;
        };
      };
      ownership: {
        Row: {
          id: string;
          tenant_id: string;
          weg_id: string;
          unit_id: string;
          person_id: string;
          von: string;
          bis: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          weg_id: string;
          unit_id: string;
          person_id: string;
          von: string;
          bis?: string | null;
        };
        Update: {
          bis?: string | null;
        };
      };
      beschluss_sammlung_entry: {
        Row: {
          id: string;
          tenant_id: string;
          weg_id: string;
          lfd_nr: number;
          beschluss_text: string;
          meeting_id: string | null;
          resolution_id: string | null;
          datum: string;          // ISO date "YYYY-MM-DD"
          typ: BeschlussSammlungTyp;
          anfechtungsstatus: AnfechtungsStatus;
          erstellt_durch: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          weg_id: string;
          // lfd_nr: GENERATED ALWAYS — omit in Insert
          beschluss_text: string;
          meeting_id?: string | null;
          resolution_id?: string | null;
          datum: string;
          typ: BeschlussSammlungTyp;
          erstellt_durch: string;
          // anfechtungsstatus defaults to 'keine' in DB
        };
        Update: Record<string, never>; // append-only — no updates
      };
      beschluss_anfechtung_event: {
        Row: {
          id: string;
          tenant_id: string;
          bse_id: string;
          event_typ: AnfechtungsEventTyp;
          aktenzeichen: string | null;
          datum: string;
          bemerkung: string | null;
          erfasst_durch: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          bse_id: string;
          event_typ: AnfechtungsEventTyp;
          aktenzeichen?: string | null;
          datum: string;
          bemerkung?: string | null;
          erfasst_durch: string;
        };
        Update: Record<string, never>; // append-only
      };
      audit_event: {
        Row: {
          id: string;
          tenant_id: string;
          seq: number;
          created_at: string;
          actor_type: AuditActorType;
          actor_user_id: string | null;
          db_role: string;
          entity_typ: string;
          entity_id: string;
          action: string;
          payload: Record<string, unknown>;
          prev_hash: string;
          row_hash: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
      };
      agent_suggestion: {
        Row: {
          id: string;
          tenant_id: string;
          meeting_id: string | null;
          weg_id: string | null;
          resolution_id: string | null;
          actor_type: AgentActorType;
          vorschlag_typ: string;
          payload: Record<string, unknown>;
          langgraph_thread_id: string | null;
          langfuse_trace_id: string | null;
          status: AgentSuggestionStatus;
          entschieden_von: string | null;
          entschieden_am: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string;
          meeting_id?: string | null;
          weg_id?: string | null;
          resolution_id?: string | null;
          actor_type: AgentActorType;
          vorschlag_typ: string;
          payload: Record<string, unknown>;
          langgraph_thread_id?: string | null;
          langfuse_trace_id?: string | null;
          status?: AgentSuggestionStatus;
        };
        Update: {
          status?: AgentSuggestionStatus;
          entschieden_von?: string | null;
          entschieden_am?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
