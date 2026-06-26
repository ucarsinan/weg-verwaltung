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
