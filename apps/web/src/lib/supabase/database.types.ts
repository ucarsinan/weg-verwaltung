import { Database as GeneratedDatabase } from "./database.types.gen";

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
export type WirtschaftsplanStatus =
  | "entwurf"
  | "aktiv"
  | "abgeloest"
  | "archiviert";

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

/**
 * Verteilungsschluessel (Migration 0056). `gemischt` is modelled but the
 * Sollstellung generator rejects it with 0A000 until the basis-value schema can
 * express which part of a mixed rule a value belongs to — see 0060.
 */
export type VerteilungsschluesselTyp =
  | "mea"
  | "einheit"
  | "flaeche"
  | "verbrauch"
  | "manuell"
  | "gemischt";

/**
 * Woher ein Zahlungseingang stammt (Migration 0061). `camt` ist bereits
 * vorgesehen, damit der Kontoauszug-Import keine weitere Migration braucht.
 */
export type ZahlungsQuelle = "manuell" | "camt";

/** Legal basis of an allocation rule (§ 16 Abs. 2 WEG). */
export type VerteilungsschluesselQuelle =
  | "gesetz"
  | "teilungserklaerung"
  | "gemeinschaftsordnung"
  | "beschluss"
  | "manuell";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Overwrite<T, U> = Omit<T, keyof U> & U;

export type Database = Overwrite<
  GeneratedDatabase,
  {
    public: Overwrite<
      GeneratedDatabase["public"],
      {
        Tables: Overwrite<
          GeneratedDatabase["public"]["Tables"],
          {
            meeting: Overwrite<
              GeneratedDatabase["public"]["Tables"]["meeting"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["meeting"]["Row"],
                  {
                    modus: MeetingModus;
                    status: MeetingStatus;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["meeting"]["Insert"],
                  {
                    modus: MeetingModus;
                    status?: MeetingStatus;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["meeting"]["Update"],
                  {
                    modus?: MeetingModus;
                    status?: MeetingStatus;
                  }
                >;
              }
            >;
            agent_suggestion: Overwrite<
              GeneratedDatabase["public"]["Tables"]["agent_suggestion"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["agent_suggestion"]["Row"],
                  {
                    actor_type: AgentActorType;
                    status: AgentSuggestionStatus;
                    vorgang_id: string | null;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["agent_suggestion"]["Insert"],
                  {
                    actor_type: AgentActorType;
                    status?: AgentSuggestionStatus;
                    vorgang_id?: string | null;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["agent_suggestion"]["Update"],
                  {
                    actor_type?: AgentActorType;
                    status?: AgentSuggestionStatus;
                    vorgang_id?: string | null;
                  }
                >;
              }
            >;
            audit_event: Overwrite<
              GeneratedDatabase["public"]["Tables"]["audit_event"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["audit_event"]["Row"],
                  {
                    actor_type: AuditActorType;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["audit_event"]["Insert"],
                  {
                    actor_type: AuditActorType;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["audit_event"]["Update"],
                  {
                    actor_type?: AuditActorType;
                  }
                >;
              }
            >;
            resolution: Overwrite<
              GeneratedDatabase["public"]["Tables"]["resolution"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["resolution"]["Row"],
                  {
                    mehrheits_typ: MehrheitsTyp;
                    stimmprinzip: Stimmprinzip;
                    legal_state: ResolutionLegalState;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["resolution"]["Insert"],
                  {
                    mehrheits_typ: MehrheitsTyp;
                    stimmprinzip: Stimmprinzip;
                    legal_state?: ResolutionLegalState;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["resolution"]["Update"],
                  {
                    mehrheits_typ?: MehrheitsTyp;
                    stimmprinzip?: Stimmprinzip;
                    legal_state?: ResolutionLegalState;
                  }
                >;
              }
            >;
            vote: Overwrite<
              GeneratedDatabase["public"]["Tables"]["vote"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["vote"]["Row"],
                  {
                    quelle: VoteQuelle;
                    wert: VoteWert;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["vote"]["Insert"],
                  {
                    quelle: VoteQuelle;
                    wert: VoteWert;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["vote"]["Update"],
                  {
                    quelle?: VoteQuelle;
                    wert?: VoteWert;
                  }
                >;
              }
            >;
            beschluss_sammlung_entry: Overwrite<
              GeneratedDatabase["public"]["Tables"]["beschluss_sammlung_entry"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_sammlung_entry"]["Row"],
                  {
                    anfechtungsstatus: AnfechtungsStatus;
                    typ: BeschlussSammlungTyp;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_sammlung_entry"]["Insert"],
                  {
                    anfechtungsstatus?: AnfechtungsStatus;
                    lfd_nr?: never;
                    resolution_id?: never;
                    typ: BeschlussSammlungTyp;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_sammlung_entry"]["Update"],
                  {
                    anfechtungsstatus?: AnfechtungsStatus;
                    lfd_nr?: never;
                    resolution_id?: never;
                    typ?: BeschlussSammlungTyp;
                  }
                >;
              }
            >;
            beschluss_anfechtung_event: Overwrite<
              GeneratedDatabase["public"]["Tables"]["beschluss_anfechtung_event"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_anfechtung_event"]["Row"],
                  {
                    event_typ: AnfechtungsEventTyp;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_anfechtung_event"]["Insert"],
                  {
                    event_typ: AnfechtungsEventTyp;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["beschluss_anfechtung_event"]["Update"],
                  {
                    event_typ?: AnfechtungsEventTyp;
                  }
                >;
              }
            >;
            wirtschaftsplan: Overwrite<
              GeneratedDatabase["public"]["Tables"]["wirtschaftsplan"],
              {
                Row: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["wirtschaftsplan"]["Row"],
                  {
                    status: WirtschaftsplanStatus;
                    aktiviert_am: string | null;
                    abgeloest_am: string | null;
                    archiviert_am: string | null;
                    version_nr: number;
                    vorgaenger_wirtschaftsplan_id: string | null;
                    wirksam_ab_monat: number | null;
                  }
                >;
                Insert: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["wirtschaftsplan"]["Insert"],
                  {
                    status?: WirtschaftsplanStatus;
                    aktiviert_am?: string | null;
                    abgeloest_am?: string | null;
                    archiviert_am?: string | null;
                    version_nr?: number;
                    vorgaenger_wirtschaftsplan_id?: string | null;
                    wirksam_ab_monat?: number | null;
                  }
                >;
                Update: Overwrite<
                  GeneratedDatabase["public"]["Tables"]["wirtschaftsplan"]["Update"],
                  {
                    status?: WirtschaftsplanStatus;
                    aktiviert_am?: string | null;
                    abgeloest_am?: string | null;
                    archiviert_am?: string | null;
                    version_nr?: number;
                    vorgaenger_wirtschaftsplan_id?: string | null;
                    wirksam_ab_monat?: number | null;
                  }
                >;
              }
            >;
            // Finance-Allocation-Tabellen (Migration 0056) — vollstaendig
            // manuell nachgetragen, weil database.types.gen.ts sie noch nicht
            // kennt (Regenerieren erfordert einen Cloud-Zugriff). Overwrite
            // ergaenzt hier neue Schluessel, statt bestehende zu ersetzen.
            verteilungsschluessel: {
              Row: {
                id: string;
                tenant_id: string;
                weg_id: string;
                name: string;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                weg_id: string;
                name: string;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                weg_id?: string;
                name?: string;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
            verteilungsschluessel_version: {
              Row: {
                id: string;
                tenant_id: string;
                verteilungsschluessel_id: string;
                typ: VerteilungsschluesselTyp;
                quelle: VerteilungsschluesselQuelle;
                resolution_id: string | null;
                gueltig_ab: string;
                gueltig_bis: string | null;
                parameter: Json;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                verteilungsschluessel_id: string;
                typ: VerteilungsschluesselTyp;
                quelle: VerteilungsschluesselQuelle;
                resolution_id?: string | null;
                gueltig_ab: string;
                gueltig_bis?: string | null;
                parameter?: Json;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                verteilungsschluessel_id?: string;
                typ?: VerteilungsschluesselTyp;
                quelle?: VerteilungsschluesselQuelle;
                resolution_id?: string | null;
                gueltig_ab?: string;
                gueltig_bis?: string | null;
                parameter?: Json;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
            verteilungsschluessel_basiswert: {
              Row: {
                id: string;
                tenant_id: string;
                verteilungsschluessel_version_id: string;
                unit_id: string;
                wert: number;
                einheit: string;
                gueltig_ab: string;
                gueltig_bis: string | null;
                notiz: string | null;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                verteilungsschluessel_version_id: string;
                unit_id: string;
                wert: number;
                einheit: string;
                gueltig_ab: string;
                gueltig_bis?: string | null;
                notiz?: string | null;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                verteilungsschluessel_version_id?: string;
                unit_id?: string;
                wert?: number;
                einheit?: string;
                gueltig_ab?: string;
                gueltig_bis?: string | null;
                notiz?: string | null;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
            wirtschaftsplan_position: {
              Row: {
                id: string;
                tenant_id: string;
                wirtschaftsplan_id: string;
                position: number;
                kostenart: string;
                beschreibung: string | null;
                jahresbetrag: number;
                verteilungsschluessel_version_id: string;
                verteilungsschluessel_snapshot: Json;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                wirtschaftsplan_id: string;
                position: number;
                kostenart: string;
                beschreibung?: string | null;
                jahresbetrag: number;
                verteilungsschluessel_version_id: string;
                verteilungsschluessel_snapshot?: Json;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                wirtschaftsplan_id?: string;
                position?: number;
                kostenart?: string;
                beschreibung?: string | null;
                jahresbetrag?: number;
                verteilungsschluessel_version_id?: string;
                verteilungsschluessel_snapshot?: Json;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
            // Zahlungskette (Migration 0061) — ebenfalls manuell nachgetragen.
            zahlung: {
              Row: {
                id: string;
                tenant_id: string;
                weg_id: string;
                betrag: number;
                wert_datum: string;
                zahler_referenz: string;
                quelle: ZahlungsQuelle;
                notiz: string | null;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                weg_id: string;
                betrag: number;
                wert_datum: string;
                zahler_referenz: string;
                quelle?: ZahlungsQuelle;
                notiz?: string | null;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                weg_id?: string;
                betrag?: number;
                wert_datum?: string;
                zahler_referenz?: string;
                quelle?: ZahlungsQuelle;
                notiz?: string | null;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
            zahlungszuordnung: {
              Row: {
                id: string;
                tenant_id: string;
                zahlung_id: string;
                sollstellung_id: string;
                betrag: number;
                created_at: string;
                updated_at: string;
              };
              Insert: {
                id?: string;
                tenant_id?: string;
                zahlung_id: string;
                sollstellung_id: string;
                betrag: number;
                created_at?: string;
                updated_at?: string;
              };
              Update: {
                id?: string;
                tenant_id?: string;
                zahlung_id?: string;
                sollstellung_id?: string;
                betrag?: number;
                created_at?: string;
                updated_at?: string;
              };
              Relationships: [];
            };
          }
        >;
        Views: Overwrite<
          GeneratedDatabase["public"]["Views"],
          {
            // Abgeleitete Sicht aus 0061: Sollstellung minus zugeordnete
            // Zahlungen. Nur lesbar — deshalb kein Insert/Update.
            offener_posten: {
              Row: {
                sollstellung_id: string;
                tenant_id: string;
                weg_id: string;
                unit_id: string;
                unit_bezeichnung: string;
                jahr: number;
                monat: number;
                soll_betrag: number;
                gezahlt_betrag: number;
                offen_betrag: number;
              };
              Relationships: [];
            };
          }
        >;
        Functions: Overwrite<
          GeneratedDatabase["public"]["Functions"],
          {
            activate_wirtschaftsplan: {
              Args: { p_wirtschaftsplan_id: string };
              Returns: undefined;
            };
            archive_wirtschaftsplan: {
              Args: { p_wirtschaftsplan_id: string };
              Returns: undefined;
            };
            create_nachtragsplan: {
              Args: { p_wirtschaftsplan_id: string };
              Returns: string;
            };
            feststellen_resolution: {
              Args: { p_resolution_id: string };
              Returns: {
                resolution_id: string;
                beschluss_sammlung_entry_id: string;
                lfd_nr: number;
                festgestellt_am: string;
                typ: BeschlussSammlungTyp;
              }[];
            };
            // Audit-Console-Read-API (Migration 0050) — Signaturen manuell
            // nachgetragen, weil database.types.gen.ts diese RPCs noch nicht
            // kennt (Regenerieren erfordert einen Cloud-Zugriff).
            audit_event_feed: {
              Args: {
                p_from?: string | null;
                p_to?: string | null;
                p_actor_type?: string | null;
                p_entity_typ?: string | null;
                p_action?: string | null;
                p_query?: string | null;
                p_flag?: string | null;
                p_cursor_created_at?: string | null;
                p_cursor_seq?: number | null;
                p_limit?: number;
              };
              Returns: {
                id: string;
                seq: number;
                created_at: string;
                actor_type: string | null;
                actor_user_id: string | null;
                db_role: string | null;
                entity_typ: string | null;
                entity_id: string | null;
                action: string | null;
                summary: string | null;
                entity_label: string | null;
                actor_label: string | null;
                risk_flags: string[] | null;
                payload_masked: Json | null;
                can_reveal_payload: boolean;
              }[];
            };
            audit_reveal_event_payload: {
              Args: { p_event_id: string; p_created_at: string };
              Returns: Json;
            };
            audit_integrity_status: {
              Args: Record<PropertyKey, never>;
              Returns: {
                id: string;
                status: string;
                checked_at: string | null;
                checked_by: string | null;
                seq_from: number | null;
                seq_to: number | null;
                rows_checked: number;
                checkpoint: Json | null;
                first_failure: Json | null;
                error_message: string | null;
              }[];
            };
            audit_verify_chain: {
              Args: Record<PropertyKey, never>;
              Returns: {
                id: string;
                status: string;
                checked_at: string | null;
                checked_by: string | null;
                seq_from: number | null;
                seq_to: number | null;
                rows_checked: number;
                checkpoint: Json | null;
                first_failure: Json | null;
                error_message: string | null;
              }[];
            };
          }
        >;
      }
    >;
  }
>;

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
