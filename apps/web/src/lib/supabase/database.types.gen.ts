export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abrechnung: {
        Row: {
          beschlossen_am: string | null
          bezeichnung: string
          created_at: string
          id: string
          jahr: number
          resolution_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          version_nr: number
          vorgaenger_abrechnung_id: string | null
          weg_id: string
        }
        Insert: {
          beschlossen_am?: string | null
          bezeichnung: string
          created_at?: string
          id?: string
          jahr: number
          resolution_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_abrechnung_id?: string | null
          weg_id: string
        }
        Update: {
          beschlossen_am?: string | null
          bezeichnung?: string
          created_at?: string
          id?: string
          jahr?: number
          resolution_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_abrechnung_id?: string | null
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_resolution_fk"
            columns: ["tenant_id", "resolution_id"]
            isOneToOne: false
            referencedRelation: "resolution"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "abrechnung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_vorgaenger_fk"
            columns: ["tenant_id", "vorgaenger_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "abrechnung_vorgaenger_fk"
            columns: ["tenant_id", "vorgaenger_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung_spitze"
            referencedColumns: ["tenant_id", "abrechnung_id"]
          },
          {
            foreignKeyName: "abrechnung_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      abrechnung_anteil: {
        Row: {
          abrechnung_kostenposition_id: string
          betrag: number
          created_at: string
          id: string
          tenant_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          abrechnung_kostenposition_id: string
          betrag: number
          created_at?: string
          id?: string
          tenant_id?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          abrechnung_kostenposition_id?: string
          betrag?: number
          created_at?: string
          id?: string
          tenant_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_anteil_kostenposition_fk"
            columns: ["tenant_id", "abrechnung_kostenposition_id"]
            isOneToOne: false
            referencedRelation: "abrechnung_kostenposition"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "abrechnung_anteil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_anteil_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      abrechnung_kostenposition: {
        Row: {
          abrechnung_id: string
          betrag_gesamt: number
          created_at: string
          id: string
          kostenart: string
          tenant_id: string
          updated_at: string
          verteilungsschluessel_version_id: string
        }
        Insert: {
          abrechnung_id: string
          betrag_gesamt: number
          created_at?: string
          id?: string
          kostenart: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id: string
        }
        Update: {
          abrechnung_id?: string
          betrag_gesamt?: number
          created_at?: string
          id?: string
          kostenart?: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_kostenposition_abrechnung_fk"
            columns: ["tenant_id", "abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "abrechnung_kostenposition_abrechnung_fk"
            columns: ["tenant_id", "abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung_spitze"
            referencedColumns: ["tenant_id", "abrechnung_id"]
          },
          {
            foreignKeyName: "abrechnung_kostenposition_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_kostenposition_version_fk"
            columns: ["tenant_id", "verteilungsschluessel_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      agenda_item: {
        Row: {
          beschreibung: string | null
          created_at: string
          id: string
          meeting_id: string
          position: number
          tenant_id: string
          titel: string
          updated_at: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          position: number
          tenant_id?: string
          titel: string
          updated_at?: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          position?: number
          tenant_id?: string
          titel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_item_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      agent_suggestion: {
        Row: {
          actor_type: string
          created_at: string
          entschieden_am: string | null
          entschieden_von: string | null
          id: string
          langfuse_trace_id: string | null
          langgraph_thread_id: string | null
          meeting_id: string | null
          payload: Json
          resolution_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          vorgang_id: string | null
          vorschlag_typ: string
          weg_id: string | null
        }
        Insert: {
          actor_type: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          langfuse_trace_id?: string | null
          langgraph_thread_id?: string | null
          meeting_id?: string | null
          payload: Json
          resolution_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vorgang_id?: string | null
          vorschlag_typ: string
          weg_id?: string | null
        }
        Update: {
          actor_type?: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          id?: string
          langfuse_trace_id?: string | null
          langgraph_thread_id?: string | null
          meeting_id?: string | null
          payload?: Json
          resolution_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vorgang_id?: string | null
          vorschlag_typ?: string
          weg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestion_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "as_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "as_resolution_fk"
            columns: ["tenant_id", "resolution_id"]
            isOneToOne: false
            referencedRelation: "resolution"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "as_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      audit_event: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2026_01: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2026_09: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2026_10: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2026_11: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2026_12: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_01: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_02: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_03: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_04: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_05: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_06: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_07: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_08: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_2027_09: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_event_default: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          db_role: string
          entity_id: string
          entity_typ: string
          id: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id: string
          entity_typ: string
          id?: string
          payload: Json
          prev_hash: string
          row_hash: string
          seq?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          db_role?: string
          entity_id?: string
          entity_typ?: string
          id?: string
          payload?: Json
          prev_hash?: string
          row_hash?: string
          seq?: never
          tenant_id?: string
        }
        Relationships: []
      }
      audit_integrity_check: {
        Row: {
          checked_at: string
          checked_by: string | null
          checkpoint: Json
          error_message: string | null
          first_failure: Json | null
          id: string
          rows_checked: number
          seq_from: number | null
          seq_to: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          checkpoint?: Json
          error_message?: string | null
          first_failure?: Json | null
          id?: string
          rows_checked?: number
          seq_from?: number | null
          seq_to?: number | null
          status: string
          tenant_id: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          checkpoint?: Json
          error_message?: string | null
          first_failure?: Json | null
          id?: string
          rows_checked?: number
          seq_from?: number | null
          seq_to?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      audit_payload_reveal: {
        Row: {
          actor_user_id: string | null
          audit_event_created_at: string
          audit_event_id: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          audit_event_created_at: string
          audit_event_id: string
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          audit_event_created_at?: string
          audit_event_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_payload_reveal_event_fk"
            columns: ["tenant_id", "audit_event_created_at", "audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_event"
            referencedColumns: ["tenant_id", "created_at", "id"]
          },
        ]
      }
      aufbewahrungsregel: {
        Row: {
          created_at: string
          doc_typ: string
          id: string
          jahre: number | null
          notiz: string | null
          rechtsgrundlage: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_typ: string
          id?: string
          jahre?: number | null
          notiz?: string | null
          rechtsgrundlage?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_typ?: string
          id?: string
          jahre?: number | null
          notiz?: string | null
          rechtsgrundlage?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aufbewahrungsregel_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      ausgabe: {
        Row: {
          art: string
          betrag: number
          created_at: string
          empfaenger: string
          id: string
          kostenart: string
          notiz: string | null
          quelle: string
          tenant_id: string
          updated_at: string
          verteilungsschluessel_version_id: string
          weg_id: string
          wert_datum: string
        }
        Insert: {
          art?: string
          betrag: number
          created_at?: string
          empfaenger: string
          id?: string
          kostenart: string
          notiz?: string | null
          quelle?: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id: string
          weg_id: string
          wert_datum: string
        }
        Update: {
          art?: string
          betrag?: number
          created_at?: string
          empfaenger?: string
          id?: string
          kostenart?: string
          notiz?: string | null
          quelle?: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id?: string
          weg_id?: string
          wert_datum?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausgabe_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausgabe_version_fk"
            columns: ["tenant_id", "verteilungsschluessel_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ausgabe_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      beschluss_anfechtung_event: {
        Row: {
          aktenzeichen: string | null
          bemerkung: string | null
          bse_id: string
          created_at: string
          datum: string
          erfasst_durch: string
          event_typ: string
          id: string
          tenant_id: string
        }
        Insert: {
          aktenzeichen?: string | null
          bemerkung?: string | null
          bse_id: string
          created_at?: string
          datum: string
          erfasst_durch: string
          event_typ: string
          id?: string
          tenant_id?: string
        }
        Update: {
          aktenzeichen?: string | null
          bemerkung?: string | null
          bse_id?: string
          created_at?: string
          datum?: string
          erfasst_durch?: string
          event_typ?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bae_bse_fk"
            columns: ["tenant_id", "bse_id"]
            isOneToOne: false
            referencedRelation: "beschluss_sammlung_entry"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      beschluss_sammlung_entry: {
        Row: {
          anfechtungsstatus: string
          beschluss_text: string
          created_at: string
          datum: string
          erstellt_durch: string
          id: string
          lfd_nr: number
          meeting_id: string | null
          resolution_id: string | null
          tenant_id: string
          typ: string
          weg_id: string
        }
        Insert: {
          anfechtungsstatus?: string
          beschluss_text: string
          created_at?: string
          datum: string
          erstellt_durch: string
          id?: string
          lfd_nr: number
          meeting_id?: string | null
          resolution_id?: string | null
          tenant_id?: string
          typ: string
          weg_id: string
        }
        Update: {
          anfechtungsstatus?: string
          beschluss_text?: string
          created_at?: string
          datum?: string
          erstellt_durch?: string
          id?: string
          lfd_nr?: number
          meeting_id?: string | null
          resolution_id?: string | null
          tenant_id?: string
          typ?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bse_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bse_resolution_fk"
            columns: ["tenant_id", "resolution_id"]
            isOneToOne: false
            referencedRelation: "resolution"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bse_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          deleted_at: string | null
          doc_typ: string
          dokument_datum: string
          id: string
          tenant_id: string
          titel: string
          updated_at: string
          weg_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          doc_typ: string
          dokument_datum: string
          id?: string
          tenant_id?: string
          titel: string
          updated_at?: string
          weg_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          doc_typ?: string
          dokument_datum?: string
          id?: string
          tenant_id?: string
          titel?: string
          updated_at?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_current_version_fk"
            columns: ["tenant_id", "current_version_id"]
            isOneToOne: false
            referencedRelation: "document_version"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "document_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      document_version: {
        Row: {
          document_id: string
          file_size_bytes: number
          id: string
          mime_type: string
          sha256: string
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          version_no: number
        }
        Insert: {
          document_id: string
          file_size_bytes: number
          id?: string
          mime_type: string
          sha256: string
          storage_path: string
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_no: number
        }
        Update: {
          document_id?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          sha256?: string
          storage_path?: string
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_version_document_fk"
            columns: ["tenant_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "document_version_document_fk"
            columns: ["tenant_id", "document_id"]
            isOneToOne: false
            referencedRelation: "dokument_uebersicht"
            referencedColumns: ["tenant_id", "dokument_id"]
          },
        ]
      }
      embedding: {
        Row: {
          chunk_text: string
          created_at: string
          doc_typ: string
          embedding: string
          heading_path: string | null
          id: string
          meta: Json
          tenant_id: string
          weg_id: string | null
        }
        Insert: {
          chunk_text: string
          created_at?: string
          doc_typ: string
          embedding: string
          heading_path?: string | null
          id?: string
          meta?: Json
          tenant_id: string
          weg_id?: string | null
        }
        Update: {
          chunk_text?: string
          created_at?: string
          doc_typ?: string
          embedding?: string
          heading_path?: string | null
          id?: string
          meta?: Json
          tenant_id?: string
          weg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      embedding_p0: {
        Row: {
          chunk_text: string
          created_at: string
          doc_typ: string
          embedding: string
          heading_path: string | null
          id: string
          meta: Json
          tenant_id: string
          weg_id: string | null
        }
        Insert: {
          chunk_text: string
          created_at?: string
          doc_typ: string
          embedding: string
          heading_path?: string | null
          id?: string
          meta?: Json
          tenant_id: string
          weg_id?: string | null
        }
        Update: {
          chunk_text?: string
          created_at?: string
          doc_typ?: string
          embedding?: string
          heading_path?: string | null
          id?: string
          meta?: Json
          tenant_id?: string
          weg_id?: string | null
        }
        Relationships: []
      }
      meeting: {
        Row: {
          created_at: string
          einladung_versand_am: string | null
          frist_einladung_ok: boolean | null
          id: string
          modus: string
          status: string
          tenant_id: string
          termin_bis: string | null
          termin_von: string | null
          titel: string
          updated_at: string
          weg_id: string
        }
        Insert: {
          created_at?: string
          einladung_versand_am?: string | null
          frist_einladung_ok?: boolean | null
          id?: string
          modus: string
          status?: string
          tenant_id?: string
          termin_bis?: string | null
          termin_von?: string | null
          titel: string
          updated_at?: string
          weg_id: string
        }
        Update: {
          created_at?: string
          einladung_versand_am?: string | null
          frist_einladung_ok?: boolean | null
          id?: string
          modus?: string
          status?: string
          tenant_id?: string
          termin_bis?: string | null
          termin_von?: string | null
          titel?: string
          updated_at?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ownership: {
        Row: {
          bis: string | null
          created_at: string
          id: string
          person_id: string
          tenant_id: string
          unit_id: string
          updated_at: string
          von: string
          weg_id: string
        }
        Insert: {
          bis?: string | null
          created_at?: string
          id?: string
          person_id: string
          tenant_id?: string
          unit_id: string
          updated_at?: string
          von: string
          weg_id: string
        }
        Update: {
          bis?: string | null
          created_at?: string
          id?: string
          person_id?: string
          tenant_id?: string
          unit_id?: string
          updated_at?: string
          von?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_person_fk"
            columns: ["tenant_id", "person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ownership_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ownership_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ownership_co_owner: {
        Row: {
          created_at: string
          id: string
          ownership_id: string
          person_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ownership_id: string
          person_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ownership_id?: string
          person_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_co_owner_ownership_fk"
            columns: ["tenant_id", "ownership_id"]
            isOneToOne: false
            referencedRelation: "ownership"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ownership_co_owner_person_fk"
            columns: ["tenant_id", "person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ownership_co_owner_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          anschrift: string | null
          created_at: string
          email: string | null
          id: string
          nachname: string
          telefon: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          vorname: string
        }
        Insert: {
          anschrift?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nachname: string
          telefon?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          vorname: string
        }
        Update: {
          anschrift?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nachname?: string
          telefon?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          vorname?: string
        }
        Relationships: []
      }
      protocol: {
        Row: {
          created_at: string
          document_id: string | null
          generierungs_quelle: string
          id: string
          langgraph_thread_id: string | null
          meeting_id: string
          status: string
          tenant_id: string
          text: string
          unterzeichnet_am: string | null
          unterzeichnet_von: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          generierungs_quelle?: string
          id?: string
          langgraph_thread_id?: string | null
          meeting_id: string
          status?: string
          tenant_id?: string
          text?: string
          unterzeichnet_am?: string | null
          unterzeichnet_von?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          generierungs_quelle?: string
          id?: string
          langgraph_thread_id?: string | null
          meeting_id?: string
          status?: string
          tenant_id?: string
          text?: string
          unterzeichnet_am?: string | null
          unterzeichnet_von?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_document_fk"
            columns: ["tenant_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "protocol_document_fk"
            columns: ["tenant_id", "document_id"]
            isOneToOne: false
            referencedRelation: "dokument_uebersicht"
            referencedColumns: ["tenant_id", "dokument_id"]
          },
          {
            foreignKeyName: "protocol_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: true
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      proxy: {
        Row: {
          created_at: string
          dokument_id: string | null
          id: string
          meeting_id: string
          tenant_id: string
          tops: string[] | null
          umfang: string
          updated_at: string
          vollmachtgeber_ownership_id: string
          vollmachtnehmer_ownership_id: string | null
          vollmachtnehmer_rolle: string | null
        }
        Insert: {
          created_at?: string
          dokument_id?: string | null
          id?: string
          meeting_id: string
          tenant_id?: string
          tops?: string[] | null
          umfang: string
          updated_at?: string
          vollmachtgeber_ownership_id: string
          vollmachtnehmer_ownership_id?: string | null
          vollmachtnehmer_rolle?: string | null
        }
        Update: {
          created_at?: string
          dokument_id?: string | null
          id?: string
          meeting_id?: string
          tenant_id?: string
          tops?: string[] | null
          umfang?: string
          updated_at?: string
          vollmachtgeber_ownership_id?: string
          vollmachtnehmer_ownership_id?: string | null
          vollmachtnehmer_rolle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxy_geber_fk"
            columns: ["tenant_id", "vollmachtgeber_ownership_id"]
            isOneToOne: false
            referencedRelation: "ownership"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "proxy_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "proxy_nehmer_fk"
            columns: ["tenant_id", "vollmachtnehmer_ownership_id"]
            isOneToOne: false
            referencedRelation: "ownership"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      resolution: {
        Row: {
          agenda_item_id: string | null
          created_at: string
          festgestellt_am: string | null
          id: string
          legal_state: string
          meeting_id: string
          mehrheits_typ: string
          stimmprinzip: string
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          agenda_item_id?: string | null
          created_at?: string
          festgestellt_am?: string | null
          id?: string
          legal_state?: string
          meeting_id: string
          mehrheits_typ: string
          stimmprinzip: string
          tenant_id?: string
          text: string
          updated_at?: string
        }
        Update: {
          agenda_item_id?: string | null
          created_at?: string
          festgestellt_am?: string | null
          id?: string
          legal_state?: string
          meeting_id?: string
          mehrheits_typ?: string
          stimmprinzip?: string
          tenant_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolution_agenda_item_fk"
            columns: ["tenant_id", "agenda_item_id"]
            isOneToOne: false
            referencedRelation: "agenda_item"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "resolution_meeting_fk"
            columns: ["tenant_id", "meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ruecklage_bewegung: {
        Row: {
          ausgabe_id: string | null
          betrag: number
          created_at: string
          datum: string
          id: string
          notiz: string | null
          richtung: string
          tenant_id: string
          updated_at: string
          weg_id: string
        }
        Insert: {
          ausgabe_id?: string | null
          betrag: number
          created_at?: string
          datum: string
          id?: string
          notiz?: string | null
          richtung: string
          tenant_id?: string
          updated_at?: string
          weg_id: string
        }
        Update: {
          ausgabe_id?: string | null
          betrag?: number
          created_at?: string
          datum?: string
          id?: string
          notiz?: string | null
          richtung?: string
          tenant_id?: string
          updated_at?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruecklage_bewegung_ausgabe_fk"
            columns: ["tenant_id", "ausgabe_id"]
            isOneToOne: false
            referencedRelation: "ausgabe"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ruecklage_bewegung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruecklage_bewegung_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      sollstellung: {
        Row: {
          betrag: number
          buchungstyp: string
          created_at: string
          gebucht_am: string
          id: string
          korrektur_von_sollstellung_id: string | null
          monat: number
          quelle: string
          tenant_id: string
          unit_id: string
          updated_at: string
          wirtschaftsplan_id: string
        }
        Insert: {
          betrag: number
          buchungstyp?: string
          created_at?: string
          gebucht_am?: string
          id?: string
          korrektur_von_sollstellung_id?: string | null
          monat: number
          quelle?: string
          tenant_id?: string
          unit_id: string
          updated_at?: string
          wirtschaftsplan_id: string
        }
        Update: {
          betrag?: number
          buchungstyp?: string
          created_at?: string
          gebucht_am?: string
          id?: string
          korrektur_von_sollstellung_id?: string | null
          monat?: number
          quelle?: string
          tenant_id?: string
          unit_id?: string
          updated_at?: string
          wirtschaftsplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sollstellung_korrektur_fk"
            columns: ["tenant_id", "korrektur_von_sollstellung_id"]
            isOneToOne: false
            referencedRelation: "offener_posten"
            referencedColumns: ["tenant_id", "sollstellung_id"]
          },
          {
            foreignKeyName: "sollstellung_korrektur_fk"
            columns: ["tenant_id", "korrektur_von_sollstellung_id"]
            isOneToOne: false
            referencedRelation: "sollstellung"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sollstellung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sollstellung_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sollstellung_wirtschaftsplan_fk"
            columns: ["tenant_id", "wirtschaftsplan_id"]
            isOneToOne: false
            referencedRelation: "wirtschaftsplan"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      tenant: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_invitation: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: string
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: string
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_member: {
        Row: {
          created_at: string
          id: string
          is_founding_admin: boolean
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_founding_admin?: boolean
          role: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_founding_admin?: boolean
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_member_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscription: {
        Row: {
          created_at: string
          current_period_ends_at: string | null
          id: string
          plan: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          tenant_id: string
          trial_ends_at: string
          trial_started_at: string
          unit_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_ends_at?: string | null
          id?: string
          plan: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          tenant_id: string
          trial_ends_at: string
          trial_started_at: string
          unit_count: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_ends_at?: string | null
          id?: string
          plan?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          tenant_id?: string
          trial_ends_at?: string
          trial_started_at?: string
          unit_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      unit: {
        Row: {
          bezeichnung: string
          created_at: string
          id: string
          mea_nenner: number
          mea_zaehler: number
          tenant_id: string
          updated_at: string
          weg_id: string
        }
        Insert: {
          bezeichnung: string
          created_at?: string
          id?: string
          mea_nenner: number
          mea_zaehler: number
          tenant_id?: string
          updated_at?: string
          weg_id: string
        }
        Update: {
          bezeichnung?: string
          created_at?: string
          id?: string
          mea_nenner?: number
          mea_zaehler?: number
          tenant_id?: string
          updated_at?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vermoegensbericht: {
        Row: {
          bezeichnung: string
          created_at: string
          erstellt_am: string | null
          id: string
          jahr: number
          status: string
          stichtag: string
          tenant_id: string
          updated_at: string
          version_nr: number
          vorgaenger_vermoegensbericht_id: string | null
          weg_id: string
        }
        Insert: {
          bezeichnung: string
          created_at?: string
          erstellt_am?: string | null
          id?: string
          jahr: number
          status?: string
          stichtag: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_vermoegensbericht_id?: string | null
          weg_id: string
        }
        Update: {
          bezeichnung?: string
          created_at?: string
          erstellt_am?: string | null
          id?: string
          jahr?: number
          status?: string
          stichtag?: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_vermoegensbericht_id?: string | null
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vermoegensbericht_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vermoegensbericht_vorgaenger_fk"
            columns: ["tenant_id", "vorgaenger_vermoegensbericht_id"]
            isOneToOne: false
            referencedRelation: "vermoegensbericht"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vermoegensbericht_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vermoegensbericht_position: {
        Row: {
          abschnitt: string
          betrag: number | null
          betrag_anfang: number | null
          bezeichnung: string
          created_at: string
          id: string
          quelle: string
          sortierung: number
          tenant_id: string
          unit_id: string | null
          updated_at: string
          vermoegensbericht_id: string
        }
        Insert: {
          abschnitt: string
          betrag?: number | null
          betrag_anfang?: number | null
          bezeichnung: string
          created_at?: string
          id?: string
          quelle?: string
          sortierung?: number
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          vermoegensbericht_id: string
        }
        Update: {
          abschnitt?: string
          betrag?: number | null
          betrag_anfang?: number | null
          bezeichnung?: string
          created_at?: string
          id?: string
          quelle?: string
          sortierung?: number
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          vermoegensbericht_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vermoegensbericht_position_bericht_fk"
            columns: ["tenant_id", "vermoegensbericht_id"]
            isOneToOne: false
            referencedRelation: "vermoegensbericht"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vermoegensbericht_position_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vermoegensbericht_position_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      verteilungsschluessel: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          weg_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
          weg_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          weg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verteilungsschluessel_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      verteilungsschluessel_basiswert: {
        Row: {
          created_at: string
          einheit: string
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          notiz: string | null
          tenant_id: string
          unit_id: string
          updated_at: string
          verteilungsschluessel_version_id: string
          wert: number
        }
        Insert: {
          created_at?: string
          einheit: string
          gueltig_ab: string
          gueltig_bis?: string | null
          id?: string
          notiz?: string | null
          tenant_id?: string
          unit_id: string
          updated_at?: string
          verteilungsschluessel_version_id: string
          wert: number
        }
        Update: {
          created_at?: string
          einheit?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          notiz?: string | null
          tenant_id?: string
          unit_id?: string
          updated_at?: string
          verteilungsschluessel_version_id?: string
          wert?: number
        }
        Relationships: [
          {
            foreignKeyName: "verteilungsschluessel_basiswert_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_basiswert_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_basiswert_version_fk"
            columns: ["tenant_id", "verteilungsschluessel_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      verteilungsschluessel_teil: {
        Row: {
          created_at: string
          gewicht: number
          id: string
          teil_version_id: string
          tenant_id: string
          updated_at: string
          verteilungsschluessel_version_id: string
        }
        Insert: {
          created_at?: string
          gewicht: number
          id?: string
          teil_version_id: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id: string
        }
        Update: {
          created_at?: string
          gewicht?: number
          id?: string
          teil_version_id?: string
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verteilungsschluessel_teil_teil_fk"
            columns: ["tenant_id", "teil_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_teil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_teil_version_fk"
            columns: ["tenant_id", "verteilungsschluessel_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      verteilungsschluessel_version: {
        Row: {
          created_at: string
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          parameter: Json
          quelle: string
          resolution_id: string | null
          tenant_id: string
          typ: string
          updated_at: string
          verteilungsschluessel_id: string
        }
        Insert: {
          created_at?: string
          gueltig_ab: string
          gueltig_bis?: string | null
          id?: string
          parameter?: Json
          quelle: string
          resolution_id?: string | null
          tenant_id?: string
          typ: string
          updated_at?: string
          verteilungsschluessel_id: string
        }
        Update: {
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          parameter?: Json
          quelle?: string
          resolution_id?: string | null
          tenant_id?: string
          typ?: string
          updated_at?: string
          verteilungsschluessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verteilungsschluessel_version_key_fk"
            columns: ["tenant_id", "verteilungsschluessel_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_version_resolution_fk"
            columns: ["tenant_id", "resolution_id"]
            isOneToOne: false
            referencedRelation: "resolution"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "verteilungsschluessel_version_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      vorgang: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          priority: string
          status: string
          tenant_id: string
          title: string
          typ: string
          updated_at: string
          visibility_state: string
          weg_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          status?: string
          tenant_id?: string
          title: string
          typ: string
          updated_at?: string
          visibility_state?: string
          weg_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          status?: string
          tenant_id?: string
          title?: string
          typ?: string
          updated_at?: string
          visibility_state?: string
          weg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_inbox_item: {
        Row: {
          body_preview: string | null
          channel: string
          created_at: string
          created_by: string | null
          id: string
          received_at: string
          source_metadata: Json
          status: string
          subject: string
          tenant_id: string
          updated_at: string
          vorgang_id: string | null
          weg_id: string | null
        }
        Insert: {
          body_preview?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          received_at?: string
          source_metadata?: Json
          status?: string
          subject: string
          tenant_id?: string
          updated_at?: string
          vorgang_id?: string | null
          weg_id?: string | null
        }
        Update: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          received_at?: string
          source_metadata?: Json
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
          vorgang_id?: string | null
          weg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_inbox_item_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_inbox_item_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vorgang_inbox_item_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_participant: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          person_id: string | null
          role: string
          tenant_id: string
          updated_at: string
          user_id: string | null
          vorgang_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          person_id?: string | null
          role: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          vorgang_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          person_id?: string | null
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_participant_person_fk"
            columns: ["tenant_id", "person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vorgang_participant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_participant_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_relation: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          relation_id: string
          relation_type: string
          tenant_id: string
          vorgang_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          relation_id: string
          relation_type: string
          tenant_id?: string
          vorgang_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          relation_id?: string
          relation_type?: string
          tenant_id?: string
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_relation_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_relation_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_task: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          vorgang_id: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: string
          tenant_id?: string
          title: string
          updated_at?: string
          vorgang_id: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_task_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_task_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_timeline_event: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          summary: string
          tenant_id: string
          visibility: string
          vorgang_id: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          summary: string
          tenant_id?: string
          visibility?: string
          vorgang_id: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          summary?: string
          tenant_id?: string
          visibility?: string
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_timeline_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_timeline_event_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vorgang_visibility: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_portal_visible: boolean
          note: string | null
          scope: string
          target_person_id: string | null
          target_user_id: string | null
          tenant_id: string
          updated_at: string
          vorgang_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_portal_visible?: boolean
          note?: string | null
          scope?: string
          target_person_id?: string | null
          target_user_id?: string | null
          tenant_id?: string
          updated_at?: string
          vorgang_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_portal_visible?: boolean
          note?: string | null
          scope?: string
          target_person_id?: string | null
          target_user_id?: string | null
          tenant_id?: string
          updated_at?: string
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorgang_visibility_person_fk"
            columns: ["tenant_id", "target_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vorgang_visibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorgang_visibility_vorgang_fk"
            columns: ["tenant_id", "vorgang_id"]
            isOneToOne: false
            referencedRelation: "vorgang"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      vote: {
        Row: {
          abgegeben_am: string
          created_at: string
          id: string
          ownership_id: string
          proxy_id: string | null
          quelle: string
          resolution_id: string
          tenant_id: string
          wert: string
        }
        Insert: {
          abgegeben_am?: string
          created_at?: string
          id?: string
          ownership_id: string
          proxy_id?: string | null
          quelle: string
          resolution_id: string
          tenant_id?: string
          wert: string
        }
        Update: {
          abgegeben_am?: string
          created_at?: string
          id?: string
          ownership_id?: string
          proxy_id?: string | null
          quelle?: string
          resolution_id?: string
          tenant_id?: string
          wert?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_ownership_fk"
            columns: ["tenant_id", "ownership_id"]
            isOneToOne: false
            referencedRelation: "ownership"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vote_proxy_fk"
            columns: ["tenant_id", "proxy_id"]
            isOneToOne: false
            referencedRelation: "proxy"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "vote_resolution_fk"
            columns: ["tenant_id", "resolution_id"]
            isOneToOne: false
            referencedRelation: "resolution"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      weg: {
        Row: {
          adresse: string | null
          amtsgericht: string | null
          created_at: string
          grundbuch_blatt: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          amtsgericht?: string | null
          created_at?: string
          grundbuch_blatt?: string | null
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          amtsgericht?: string | null
          created_at?: string
          grundbuch_blatt?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weg_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      wirtschaftsplan: {
        Row: {
          abgeloest_am: string | null
          aktiviert_am: string | null
          archiviert_am: string | null
          bezeichnung: string
          created_at: string
          gesamtkosten: number
          id: string
          jahr: number
          status: string
          tenant_id: string
          updated_at: string
          version_nr: number
          vorgaenger_wirtschaftsplan_id: string | null
          weg_id: string
          wirksam_ab_monat: number | null
        }
        Insert: {
          abgeloest_am?: string | null
          aktiviert_am?: string | null
          archiviert_am?: string | null
          bezeichnung: string
          created_at?: string
          gesamtkosten: number
          id?: string
          jahr: number
          status?: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_wirtschaftsplan_id?: string | null
          weg_id: string
          wirksam_ab_monat?: number | null
        }
        Update: {
          abgeloest_am?: string | null
          aktiviert_am?: string | null
          archiviert_am?: string | null
          bezeichnung?: string
          created_at?: string
          gesamtkosten?: number
          id?: string
          jahr?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          version_nr?: number
          vorgaenger_wirtschaftsplan_id?: string | null
          weg_id?: string
          wirksam_ab_monat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wirtschaftsplan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wirtschaftsplan_vorgaenger_fk"
            columns: ["tenant_id", "vorgaenger_wirtschaftsplan_id"]
            isOneToOne: false
            referencedRelation: "wirtschaftsplan"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "wirtschaftsplan_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      wirtschaftsplan_position: {
        Row: {
          beschreibung: string | null
          created_at: string
          id: string
          jahresbetrag: number
          kostenart: string
          position: number
          tenant_id: string
          updated_at: string
          verteilungsschluessel_snapshot: Json
          verteilungsschluessel_version_id: string
          wirtschaftsplan_id: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          jahresbetrag: number
          kostenart: string
          position: number
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_snapshot?: Json
          verteilungsschluessel_version_id: string
          wirtschaftsplan_id: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          jahresbetrag?: number
          kostenart?: string
          position?: number
          tenant_id?: string
          updated_at?: string
          verteilungsschluessel_snapshot?: Json
          verteilungsschluessel_version_id?: string
          wirtschaftsplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wirtschaftsplan_position_plan_fk"
            columns: ["tenant_id", "wirtschaftsplan_id"]
            isOneToOne: false
            referencedRelation: "wirtschaftsplan"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "wirtschaftsplan_position_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wirtschaftsplan_position_version_fk"
            columns: ["tenant_id", "verteilungsschluessel_version_id"]
            isOneToOne: false
            referencedRelation: "verteilungsschluessel_version"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      zahlung: {
        Row: {
          betrag: number
          created_at: string
          id: string
          notiz: string | null
          quelle: string
          tenant_id: string
          updated_at: string
          weg_id: string
          wert_datum: string
          zahler_referenz: string
        }
        Insert: {
          betrag: number
          created_at?: string
          id?: string
          notiz?: string | null
          quelle?: string
          tenant_id?: string
          updated_at?: string
          weg_id: string
          wert_datum: string
          zahler_referenz: string
        }
        Update: {
          betrag?: number
          created_at?: string
          id?: string
          notiz?: string | null
          quelle?: string
          tenant_id?: string
          updated_at?: string
          weg_id?: string
          wert_datum?: string
          zahler_referenz?: string
        }
        Relationships: [
          {
            foreignKeyName: "zahlung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlung_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      zahlungszuordnung: {
        Row: {
          betrag: number
          created_at: string
          id: string
          sollstellung_id: string
          tenant_id: string
          updated_at: string
          zahlung_id: string
        }
        Insert: {
          betrag: number
          created_at?: string
          id?: string
          sollstellung_id: string
          tenant_id?: string
          updated_at?: string
          zahlung_id: string
        }
        Update: {
          betrag?: number
          created_at?: string
          id?: string
          sollstellung_id?: string
          tenant_id?: string
          updated_at?: string
          zahlung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zahlungszuordnung_sollstellung_fk"
            columns: ["tenant_id", "sollstellung_id"]
            isOneToOne: false
            referencedRelation: "offener_posten"
            referencedColumns: ["tenant_id", "sollstellung_id"]
          },
          {
            foreignKeyName: "zahlungszuordnung_sollstellung_fk"
            columns: ["tenant_id", "sollstellung_id"]
            isOneToOne: false
            referencedRelation: "sollstellung"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "zahlungszuordnung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungszuordnung_zahlung_fk"
            columns: ["tenant_id", "zahlung_id"]
            isOneToOne: false
            referencedRelation: "zahlung"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Views: {
      abrechnung_spitze: {
        Row: {
          abrechnung_id: string | null
          jahr: number | null
          kostenanteil: number | null
          soll_vorschuesse: number | null
          spitze: number | null
          tenant_id: string | null
          unit_bezeichnung: string | null
          unit_id: string | null
          weg_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      aufbewahrung_effektiv: {
        Row: {
          doc_typ: string | null
          herkunft: string | null
          jahre: number | null
          notiz: string | null
          rechtsgrundlage: string | null
        }
        Relationships: []
      }
      dokument_uebersicht: {
        Row: {
          aufzubewahren_bis: string | null
          created_at: string | null
          deleted_at: string | null
          doc_typ: string | null
          dokument_datum: string | null
          dokument_id: string | null
          file_size_bytes: number | null
          frist_herkunft: string | null
          mime_type: string | null
          storage_path: string | null
          tenant_id: string | null
          titel: string | null
          version_no: number | null
          weg_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      offener_posten: {
        Row: {
          gezahlt_betrag: number | null
          jahr: number | null
          monat: number | null
          offen_betrag: number | null
          soll_betrag: number | null
          sollstellung_id: string | null
          tenant_id: string | null
          unit_bezeichnung: string | null
          unit_id: string | null
          weg_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sollstellung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sollstellung_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ruecklage_entwicklung: {
        Row: {
          anfangsbestand: number | null
          endbestand: number | null
          entnahmen: number | null
          jahr: number | null
          tenant_id: string | null
          weg_id: string | null
          zufuehrungen: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ruecklage_bewegung_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruecklage_bewegung_weg_fk"
            columns: ["tenant_id", "weg_id"]
            isOneToOne: false
            referencedRelation: "weg"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Functions: {
      accept_tenant_invitation: {
        Args: { p_nachname: string; p_token_hash: string; p_vorname: string }
        Returns: {
          member_id: string
          person_id: string
          tenant_id: string
        }[]
      }
      activate_wirtschaftsplan: {
        Args: { p_wirtschaftsplan_id: string }
        Returns: undefined
      }
      archive_partition: { Args: { p_name: string }; Returns: undefined }
      archive_wirtschaftsplan: {
        Args: { p_wirtschaftsplan_id: string }
        Returns: undefined
      }
      audit_actor_label: {
        Args: { p_actor_type: string; p_actor_user_id: string }
        Returns: string
      }
      audit_entity_label: {
        Args: { p_entity_id: string; p_entity_typ: string; p_payload: Json }
        Returns: string
      }
      audit_event_feed: {
        Args: {
          p_action?: string
          p_actor_type?: string
          p_cursor_created_at?: string
          p_cursor_seq?: number
          p_entity_typ?: string
          p_flag?: string
          p_from?: string
          p_limit?: number
          p_query?: string
          p_to?: string
        }
        Returns: {
          action: string
          actor_label: string
          actor_type: string
          actor_user_id: string
          can_reveal_payload: boolean
          created_at: string
          db_role: string
          entity_id: string
          entity_label: string
          entity_typ: string
          id: string
          payload_masked: Json
          risk_flags: string[]
          seq: number
          summary: string
        }[]
      }
      audit_event_summary: {
        Args: { p_action: string; p_entity_typ: string; p_payload: Json }
        Returns: string
      }
      audit_integrity_status: {
        Args: never
        Returns: {
          checked_at: string
          checked_by: string
          checkpoint: Json
          error_message: string
          first_failure: Json
          id: string
          rows_checked: number
          seq_from: number
          seq_to: number
          status: string
        }[]
      }
      audit_mask_payload: { Args: { p_payload: Json }; Returns: Json }
      audit_reveal_event_payload: {
        Args: { p_created_at: string; p_event_id: string }
        Returns: Json
      }
      audit_risk_flags: {
        Args: { p_actor_type: string; p_db_role: string; p_payload: Json }
        Returns: string[]
      }
      audit_verify_chain: {
        Args: never
        Returns: {
          checked_at: string
          checked_by: string
          checkpoint: Json
          error_message: string
          first_failure: Json
          id: string
          rows_checked: number
          seq_from: number
          seq_to: number
          status: string
        }[]
      }
      beschliesse_abrechnung: {
        Args: {
          p_abrechnung_id: string
          p_beschlossen_am: string
          p_resolution_id?: string
        }
        Returns: undefined
      }
      check_partition_archivable: { Args: { p_name: string }; Returns: Json }
      create_nachtragsplan: {
        Args: { p_wirtschaftsplan_id: string }
        Returns: string
      }
      create_self_managed_weg_trial: {
        Args: {
          p_address: Json
          p_plan: string
          p_tenant_name: string
          p_unit_count: number
          p_weg_name: string
        }
        Returns: {
          subscription_id: string
          tenant_id: string
          weg_id: string
        }[]
      }
      create_tenant_invitation: {
        Args: {
          p_email: string
          p_expires_at?: string
          p_role: string
          p_token_hash: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      erstelle_abrechnung: {
        Args: { p_jahr: number; p_weg_id: string }
        Returns: string
      }
      erstelle_vermoegensbericht: {
        Args: { p_jahr: number; p_weg_id: string }
        Returns: string
      }
      feststellen_resolution: {
        Args: { p_resolution_id: string }
        Returns: {
          beschluss_sammlung_entry_id: string
          festgestellt_am: string
          lfd_nr: number
          resolution_id: string
          typ: string
        }[]
      }
      generate_sollstellungen: {
        Args: { p_wirtschaftsplan_id: string }
        Returns: undefined
      }
      get_archivable_partitions: {
        Args: never
        Returns: {
          partition_date: string
          partition_name: string
        }[]
      }
      has_role: { Args: { target_role: string }; Returns: boolean }
      is_partition_detached: { Args: { p_name: string }; Returns: Json }
      stelle_vermoegensbericht_fertig: {
        Args: { p_erstellt_am: string; p_vermoegensbericht_id: string }
        Returns: undefined
      }
      tenant_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
