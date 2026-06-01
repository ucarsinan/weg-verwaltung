npm warn exec The following package was not found and will be installed: supabase@2.103.0
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
          vorschlag_typ?: string
          weg_id?: string | null
        }
        Relationships: [
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
      audit_event_2026_05: {
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
      audit_event_2026_06: {
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
      audit_event_2026_07: {
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
      audit_event_2026_08: {
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
          lfd_nr?: never
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
          lfd_nr?: never
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
      tenant_member: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      has_role: { Args: { target_role: string }; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
