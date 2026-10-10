
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_logs": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"candidates": {
                  Row: {
                    "connected_at": string | null,"connected_via": Database["public"]['Enums']["connection_source"] | null,"created_at": string,"degree_level": Database["public"]['Enums']["degree_level"] | null,"discipline": Database["public"]['Enums']["discipline"] | null,"discipline_confidence": Database["public"]['Enums']["classification_confidence"],"discovered_at": string,"full_name": string,"grad_year": number | null,"id": string,"is_preexisting_connection": boolean,"notes": string | null,"profile_key": string,"profile_url": string,"raw_program_text": string | null,"raw_school_text": string | null,"role": string | null,"source": Database["public"]['Enums']["candidate_source"],"status": Database["public"]['Enums']["candidate_status"],"university": Database["public"]['Enums']["university"] | null,"university_confidence": Database["public"]['Enums']["classification_confidence"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connected_at"?: string | null,"connected_via"?: Database["public"]['Enums']["connection_source"] | null,"created_at"?: string,"degree_level"?: Database["public"]['Enums']["degree_level"] | null,"discipline"?: Database["public"]['Enums']["discipline"] | null,"discipline_confidence"?: Database["public"]['Enums']["classification_confidence"],"discovered_at"?: string,"full_name": string,"grad_year"?: number | null,"id"?: string,"is_preexisting_connection"?: boolean,"notes"?: string | null,"profile_key": string,"profile_url": string,"raw_program_text"?: string | null,"raw_school_text"?: string | null,"role"?: string | null,"source"?: Database["public"]['Enums']["candidate_source"],"status"?: Database["public"]['Enums']["candidate_status"],"university"?: Database["public"]['Enums']["university"] | null,"university_confidence"?: Database["public"]['Enums']["classification_confidence"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "connected_at"?: string | null,"connected_via"?: Database["public"]['Enums']["connection_source"] | null,"created_at"?: string,"degree_level"?: Database["public"]['Enums']["degree_level"] | null,"discipline"?: Database["public"]['Enums']["discipline"] | null,"discipline_confidence"?: Database["public"]['Enums']["classification_confidence"],"discovered_at"?: string,"full_name"?: string,"grad_year"?: number | null,"id"?: string,"is_preexisting_connection"?: boolean,"notes"?: string | null,"profile_key"?: string,"profile_url"?: string,"raw_program_text"?: string | null,"raw_school_text"?: string | null,"role"?: string | null,"source"?: Database["public"]['Enums']["candidate_source"],"status"?: Database["public"]['Enums']["candidate_status"],"university"?: Database["public"]['Enums']["university"] | null,"university_confidence"?: Database["public"]['Enums']["classification_confidence"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"connection_snapshots": {
                  Row: {
                    "created_at": string,"id": string,"recorded_at": string,"source": Database["public"]['Enums']["record_source"],"total_connections": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"recorded_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"total_connections": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"recorded_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"total_connections"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_queue": {
                  Row: {
                    "candidate_id": string,"created_at": string,"id": string,"is_alternate": boolean,"note_draft": string | null,"queue_date": string,"rank": number,"reason": string,"state": Database["public"]['Enums']["queue_item_state"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"created_at"?: string,"id"?: string,"is_alternate"?: boolean,"note_draft"?: string | null,"queue_date": string,"rank": number,"reason": string,"state"?: Database["public"]['Enums']["queue_item_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "candidate_id"?: string,"created_at"?: string,"id"?: string,"is_alternate"?: boolean,"note_draft"?: string | null,"queue_date"?: string,"rank"?: number,"reason"?: string,"state"?: Database["public"]['Enums']["queue_item_state"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_queue_candidate_id_user_id_fkey"
      columns: ["candidate_id","user_id"]
isOneToOne: false
      referencedRelation: "candidates"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "candidate_id": string,"created_at": string,"had_note": boolean,"id": string,"note_text": string | null,"outcome": Database["public"]['Enums']["invitation_outcome"],"resolved_at": string | null,"sent_at": string,"source": Database["public"]['Enums']["record_source"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"created_at"?: string,"had_note"?: boolean,"id"?: string,"note_text"?: string | null,"outcome"?: Database["public"]['Enums']["invitation_outcome"],"resolved_at"?: string | null,"sent_at": string,"source"?: Database["public"]['Enums']["record_source"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "candidate_id"?: string,"created_at"?: string,"had_note"?: boolean,"id"?: string,"note_text"?: string | null,"outcome"?: Database["public"]['Enums']["invitation_outcome"],"resolved_at"?: string | null,"sent_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_candidate_id_user_id_fkey"
      columns: ["candidate_id","user_id"]
isOneToOne: false
      referencedRelation: "candidates"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"job": string,"run_date": string,"started_at": string,"stats": NonNullable<Json>,"status": Database["public"]['Enums']["job_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job": string,"run_date": string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["job_status"],"user_id": string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job"?: string,"run_date"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["job_status"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "baseline_connections": number | null,"count_ubco_as_ubc": boolean,"created_at": string,"daily_invite_target": number | null,"discipline_priority": (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance": number | null,"note_char_limit": number,"overall_target": number,"pause_reason": string | null,"paused": boolean,"paused_at": string | null,"project_start_date": string,"stale_pending_days": number,"timezone": string,"updated_at": string,"user_id": string,"weekly_invite_cap": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance"?: number | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
                  }
                  Update: {
                    "baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance"?: number | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"targets": {
                  Row: {
                    "created_at": string,"discipline": Database["public"]['Enums']["discipline"],"id": string,"target_count": number,"university": Database["public"]['Enums']["university"] | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discipline": Database["public"]['Enums']["discipline"],"id"?: string,"target_count": number,"university"?: Database["public"]['Enums']["university"] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"discipline"?: Database["public"]['Enums']["discipline"],"id"?: string,"target_count"?: number,"university"?: Database["public"]['Enums']["university"] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "candidate_category_counts": {
                  Row: {
                    "candidate_count": number | null,"classified": boolean | null,"discipline": Database["public"]['Enums']["discipline"] | null,"status": Database["public"]['Enums']["candidate_status"] | null,"university": Database["public"]['Enums']["university"] | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "delete_invitation":
{ Args: { "p_candidate_id": string }; Returns: undefined
                           },
"record_invitation_sent":
{ Args: { "p_candidate_id": string,"p_note_text"?: string,"p_sent_at"?: string,"p_source"?: Database["public"]['Enums']["record_source"] }; Returns: string
                           },
"resolve_invitation":
{ Args: { "p_candidate_id": string,"p_outcome": Database["public"]['Enums']["invitation_outcome"],"p_resolved_at"?: string }; Returns: undefined
                           }
          }
          Enums: {
            "candidate_source": "manual"|"csv"|"linkedin_export","candidate_status": "new"|"awaiting_review"|"approved"|"invitation_sent"|"invitation_pending"|"connected"|"declined_withdrawn"|"not_a_match"|"do_not_contact","classification_confidence": "confirmed"|"needs_review","connection_source": "invitation"|"export","degree_level": "undergraduate"|"masters"|"doctoral"|"alumni"|"other","discipline": "ce"|"ee"|"mech"|"cs","invitation_outcome": "pending"|"accepted"|"declined"|"withdrawn","job_status": "running"|"succeeded"|"failed","queue_item_state": "queued"|"sent"|"skipped","record_source": "manual"|"linkedin_export","university": "uoft"|"ubc"|"sfu"|"waterloo"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "candidate_source": ["manual", "csv", "linkedin_export"],"candidate_status": ["new", "awaiting_review", "approved", "invitation_sent", "invitation_pending", "connected", "declined_withdrawn", "not_a_match", "do_not_contact"],"classification_confidence": ["confirmed", "needs_review"],"connection_source": ["invitation", "export"],"degree_level": ["undergraduate", "masters", "doctoral", "alumni", "other"],"discipline": ["ce", "ee", "mech", "cs"],"invitation_outcome": ["pending", "accepted", "declined", "withdrawn"],"job_status": ["running", "succeeded", "failed"],"queue_item_state": ["queued", "sent", "skipped"],"record_source": ["manual", "linkedin_export"],"university": ["uoft", "ubc", "sfu", "waterloo"]
          }
        }
} as const
