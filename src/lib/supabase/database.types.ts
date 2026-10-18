
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
                },"ai_usage": {
                  Row: {
                    "day": string,"used": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"used"?: number,"user_id": string
                  }
                  Update: {
                    "day"?: string,"used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"application_contacts": {
                  Row: {
                    "application_id": string,"created_at": string,"person_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"person_id": string,"role"?: string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"person_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_contacts_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "application_contacts_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"application_documents": {
                  Row: {
                    "application_id": string,"content": NonNullable<Json>,"created_at": string,"id": string,"kind": string,"label": string,"resume_id": string | null,"tailored_document_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"content": NonNullable<Json>,"created_at"?: string,"id"?: string,"kind": string,"label": string,"resume_id"?: string | null,"tailored_document_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"kind"?: string,"label"?: string,"resume_id"?: string | null,"tailored_document_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_documents_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "application_documents_resume_id_user_id_fkey"
      columns: ["resume_id","user_id"]
isOneToOne: false
      referencedRelation: "resumes"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "application_documents_tailored_document_id_user_id_fkey"
      columns: ["tailored_document_id","user_id"]
isOneToOne: false
      referencedRelation: "tailored_documents"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"application_events": {
                  Row: {
                    "application_id": string,"created_at": string,"detail": string | null,"from_stage": Database["public"]['Enums']["application_stage"] | null,"id": string,"interaction_id": string | null,"kind": string,"occurred_at": string,"to_stage": Database["public"]['Enums']["application_stage"] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"detail"?: string | null,"from_stage"?: Database["public"]['Enums']["application_stage"] | null,"id"?: string,"interaction_id"?: string | null,"kind": string,"occurred_at"?: string,"to_stage"?: Database["public"]['Enums']["application_stage"] | null,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"detail"?: string | null,"from_stage"?: Database["public"]['Enums']["application_stage"] | null,"id"?: string,"interaction_id"?: string | null,"kind"?: string,"occurred_at"?: string,"to_stage"?: Database["public"]['Enums']["application_stage"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_events_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "application_events_interaction_id_fkey"
      columns: ["interaction_id"]
isOneToOne: false
      referencedRelation: "network_interactions"
      referencedColumns: ["id"]
    }
                  ]
                },"application_interviews": {
                  Row: {
                    "application_id": string,"created_at": string,"duration_minutes": number,"ics_sequence": number,"id": string,"kind": string,"location": string | null,"notes": string | null,"starts_at": string,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"duration_minutes"?: number,"ics_sequence"?: number,"id"?: string,"kind"?: string,"location"?: string | null,"notes"?: string | null,"starts_at": string,"timezone": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"duration_minutes"?: number,"ics_sequence"?: number,"id"?: string,"kind"?: string,"location"?: string | null,"notes"?: string | null,"starts_at"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_interviews_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"application_reminders": {
                  Row: {
                    "application_id": string,"created_at": string,"done_at": string | null,"due_at": string,"id": string,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"done_at"?: string | null,"due_at": string,"id"?: string,"text": string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"done_at"?: string | null,"due_at"?: string,"id"?: string,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_reminders_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "applied_on": string | null,"apply_url": string | null,"attempt": number,"company": string | null,"created_at": string,"id": string,"is_sample": boolean,"job_id": string | null,"location": string | null,"notes": string | null,"offered_pay_amount": number | null,"offered_pay_currency": string | null,"offered_pay_period": string | null,"source": string | null,"stage": Database["public"]['Enums']["application_stage"],"stage_changed_at": string,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_on"?: string | null,"apply_url"?: string | null,"attempt"?: number,"company"?: string | null,"created_at"?: string,"id"?: string,"is_sample"?: boolean,"job_id"?: string | null,"location"?: string | null,"notes"?: string | null,"offered_pay_amount"?: number | null,"offered_pay_currency"?: string | null,"offered_pay_period"?: string | null,"source"?: string | null,"stage"?: Database["public"]['Enums']["application_stage"],"stage_changed_at"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Update: {
                    "applied_on"?: string | null,"apply_url"?: string | null,"attempt"?: number,"company"?: string | null,"created_at"?: string,"id"?: string,"is_sample"?: boolean,"job_id"?: string | null,"location"?: string | null,"notes"?: string | null,"offered_pay_amount"?: number | null,"offered_pay_currency"?: string | null,"offered_pay_period"?: string | null,"source"?: string | null,"stage"?: Database["public"]['Enums']["application_stage"],"stage_changed_at"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"candidates": {
                  Row: {
                    "connected_at": string | null,"connected_via": Database["public"]['Enums']["connection_source"] | null,"created_at": string,"degree_level": Database["public"]['Enums']["degree_level"] | null,"discipline": string | null,"discipline_confidence": Database["public"]['Enums']["classification_confidence"],"discovered_at": string,"full_name": string,"grad_year": number | null,"id": string,"is_preexisting_connection": boolean,"is_sample": boolean,"notes": string | null,"profile_key": string,"profile_url": string,"raw_program_text": string | null,"raw_school_text": string | null,"role": string | null,"source": Database["public"]['Enums']["candidate_source"],"status": Database["public"]['Enums']["candidate_status"],"university": string | null,"university_confidence": Database["public"]['Enums']["classification_confidence"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connected_at"?: string | null,"connected_via"?: Database["public"]['Enums']["connection_source"] | null,"created_at"?: string,"degree_level"?: Database["public"]['Enums']["degree_level"] | null,"discipline"?: string | null,"discipline_confidence"?: Database["public"]['Enums']["classification_confidence"],"discovered_at"?: string,"full_name": string,"grad_year"?: number | null,"id"?: string,"is_preexisting_connection"?: boolean,"is_sample"?: boolean,"notes"?: string | null,"profile_key": string,"profile_url": string,"raw_program_text"?: string | null,"raw_school_text"?: string | null,"role"?: string | null,"source"?: Database["public"]['Enums']["candidate_source"],"status"?: Database["public"]['Enums']["candidate_status"],"university"?: string | null,"university_confidence"?: Database["public"]['Enums']["classification_confidence"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "connected_at"?: string | null,"connected_via"?: Database["public"]['Enums']["connection_source"] | null,"created_at"?: string,"degree_level"?: Database["public"]['Enums']["degree_level"] | null,"discipline"?: string | null,"discipline_confidence"?: Database["public"]['Enums']["classification_confidence"],"discovered_at"?: string,"full_name"?: string,"grad_year"?: number | null,"id"?: string,"is_preexisting_connection"?: boolean,"is_sample"?: boolean,"notes"?: string | null,"profile_key"?: string,"profile_url"?: string,"raw_program_text"?: string | null,"raw_school_text"?: string | null,"role"?: string | null,"source"?: Database["public"]['Enums']["candidate_source"],"status"?: Database["public"]['Enums']["candidate_status"],"university"?: string | null,"university_confidence"?: Database["public"]['Enums']["classification_confidence"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "candidates_discipline_owned"
      columns: ["discipline","user_id"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "candidates_university_owned"
      columns: ["university","user_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"client_errors": {
                  Row: {
                    "digest": string | null,"fingerprint": string,"first_seen": string,"last_seen": string,"message": string,"occurrences": number,"route": string,"source": string,"stack": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "digest"?: string | null,"fingerprint": string,"first_seen"?: string,"last_seen"?: string,"message": string,"occurrences"?: number,"route": string,"source": string,"stack"?: string | null
                  }
                  Update: {
                    "digest"?: string | null,"fingerprint"?: string,"first_seen"?: string,"last_seen"?: string,"message"?: string,"occurrences"?: number,"route"?: string,"source"?: string,"stack"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"company_aliases": {
                  Row: {
                    "a_key": string,"b_key": string,"created_at": string,"decision": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "a_key": string,"b_key": string,"created_at"?: string,"decision": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "a_key"?: string,"b_key"?: string,"created_at"?: string,"decision"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"connection_snapshots": {
                  Row: {
                    "created_at": string,"id": string,"is_sample": boolean,"recorded_at": string,"source": Database["public"]['Enums']["record_source"],"total_connections": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_sample"?: boolean,"recorded_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"total_connections": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_sample"?: boolean,"recorded_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"total_connections"?: number,"user_id"?: string
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
                },"disciplines": {
                  Row: {
                    "aliases": (string)[],"created_at": string,"id": string,"is_sample": boolean,"name": string,"position": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"created_at"?: string,"id"?: string,"is_sample"?: boolean,"name": string,"position"?: number,"user_id"?: string
                  }
                  Update: {
                    "aliases"?: (string)[],"created_at"?: string,"id"?: string,"is_sample"?: boolean,"name"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_deliveries": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"last_error": string | null,"next_attempt_at": string,"notification_id": string,"sent_at": string | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"notification_id": string,"sent_at"?: string | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"notification_id"?: string,"sent_at"?: string | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_deliveries_notification_id_user_id_fkey"
      columns: ["notification_id","user_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"employers": {
                  Row: {
                    "added_by": string | null,"ats": Database["public"]['Enums']["ats_kind"],"board_token": string,"careers_url": string | null,"created_at": string,"etag": string | null,"failures": number,"id": string,"last_crawled_at": string | null,"last_error": string | null,"matching_jobs": number,"name": string,"next_crawl_at": string,"status": Database["public"]['Enums']["employer_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"ats": Database["public"]['Enums']["ats_kind"],"board_token": string,"careers_url"?: string | null,"created_at"?: string,"etag"?: string | null,"failures"?: number,"id"?: string,"last_crawled_at"?: string | null,"last_error"?: string | null,"matching_jobs"?: number,"name": string,"next_crawl_at"?: string,"status"?: Database["public"]['Enums']["employer_status"],"updated_at"?: string
                  }
                  Update: {
                    "added_by"?: string | null,"ats"?: Database["public"]['Enums']["ats_kind"],"board_token"?: string,"careers_url"?: string | null,"created_at"?: string,"etag"?: string | null,"failures"?: number,"id"?: string,"last_crawled_at"?: string | null,"last_error"?: string | null,"matching_jobs"?: number,"name"?: string,"next_crawl_at"?: string,"status"?: Database["public"]['Enums']["employer_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"follow_ups": {
                  Row: {
                    "candidate_id": string,"created_at": string,"done_at": string | null,"due_on": string,"id": string,"is_sample": boolean,"kind": string,"state": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"created_at"?: string,"done_at"?: string | null,"due_on": string,"id"?: string,"is_sample"?: boolean,"kind": string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "candidate_id"?: string,"created_at"?: string,"done_at"?: string | null,"due_on"?: string,"id"?: string,"is_sample"?: boolean,"kind"?: string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_ups_candidate_id_user_id_fkey"
      columns: ["candidate_id","user_id"]
isOneToOne: false
      referencedRelation: "candidates"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"improvement_notes": {
                  Row: {
                    "created_at": string,"dismissed": (string)[],"id": string,"match_id": string,"method": string,"reason": string,"report": NonNullable<Json>,"resume_id": string,"resume_updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dismissed"?: (string)[],"id"?: string,"match_id": string,"method": string,"reason"?: string,"report": NonNullable<Json>,"resume_id": string,"resume_updated_at": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"dismissed"?: (string)[],"id"?: string,"match_id"?: string,"method"?: string,"reason"?: string,"report"?: NonNullable<Json>,"resume_id"?: string,"resume_updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "improvement_notes_match_id_user_id_fkey"
      columns: ["match_id","user_id"]
isOneToOne: false
      referencedRelation: "job_matches"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "improvement_notes_resume_id_user_id_fkey"
      columns: ["resume_id","user_id"]
isOneToOne: false
      referencedRelation: "resumes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"interview_preps": {
                  Row: {
                    "application_id": string,"content": NonNullable<Json>,"created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"content": NonNullable<Json>,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interview_preps_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "candidate_id": string,"created_at": string,"had_note": boolean,"id": string,"is_sample": boolean,"note_text": string | null,"outcome": Database["public"]['Enums']["invitation_outcome"],"resolved_at": string | null,"sent_at": string,"source": Database["public"]['Enums']["record_source"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"created_at"?: string,"had_note"?: boolean,"id"?: string,"is_sample"?: boolean,"note_text"?: string | null,"outcome"?: Database["public"]['Enums']["invitation_outcome"],"resolved_at"?: string | null,"sent_at": string,"source"?: Database["public"]['Enums']["record_source"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "candidate_id"?: string,"created_at"?: string,"had_note"?: boolean,"id"?: string,"is_sample"?: boolean,"note_text"?: string | null,"outcome"?: Database["public"]['Enums']["invitation_outcome"],"resolved_at"?: string | null,"sent_at"?: string,"source"?: Database["public"]['Enums']["record_source"],"updated_at"?: string,"user_id"?: string
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
                },"job_crawl_runs": {
                  Row: {
                    "boards": number,"closed_jobs": number,"embedded": number,"failed": number,"finished_at": string | null,"id": string,"new_jobs": number,"not_modified": number,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "boards"?: number,"closed_jobs"?: number,"embedded"?: number,"failed"?: number,"finished_at"?: string | null,"id"?: string,"new_jobs"?: number,"not_modified"?: number,"started_at"?: string
                  }
                  Update: {
                    "boards"?: number,"closed_jobs"?: number,"embedded"?: number,"failed"?: number,"finished_at"?: string | null,"id"?: string,"new_jobs"?: number,"not_modified"?: number,"started_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_filters": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"pattern": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"pattern": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"pattern"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_matches": {
                  Row: {
                    "created_at": string,"exclusion_reasons": (string)[],"fit_score": number,"id": string,"job_id": string,"method": string,"requirement_results": NonNullable<Json>,"resume_id": string,"summary": string | null,"tier": Database["public"]['Enums']["job_fit_tier"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exclusion_reasons"?: (string)[],"fit_score": number,"id"?: string,"job_id": string,"method": string,"requirement_results"?: NonNullable<Json>,"resume_id": string,"summary"?: string | null,"tier": Database["public"]['Enums']["job_fit_tier"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"exclusion_reasons"?: (string)[],"fit_score"?: number,"id"?: string,"job_id"?: string,"method"?: string,"requirement_results"?: NonNullable<Json>,"resume_id"?: string,"summary"?: string | null,"tier"?: Database["public"]['Enums']["job_fit_tier"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_matches_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_matches_resume_id_user_id_fkey"
      columns: ["resume_id","user_id"]
isOneToOne: false
      referencedRelation: "resumes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"job_notes": {
                  Row: {
                    "body": string,"id": string,"job_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"id"?: string,"job_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"job_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_notes_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_requirements": {
                  Row: {
                    "category": string,"degree_level": string | null,"embedding": string | null,"idx": number,"job_id": string,"kind": string,"text": string,"years": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"degree_level"?: string | null,"embedding"?: string | null,"idx": number,"job_id": string,"kind": string,"text": string,"years"?: number | null
                  }
                  Update: {
                    "category"?: string,"degree_level"?: string | null,"embedding"?: string | null,"idx"?: number,"job_id"?: string,"kind"?: string,"text"?: string,"years"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_requirements_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
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
                },"job_search_cache": {
                  Row: {
                    "fetched_at": string,"next_cursor": string | null,"provider": string,"query_key": string,"result_count": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fetched_at"?: string,"next_cursor"?: string | null,"provider": string,"query_key": string,"result_count"?: number,"status": string
                  }
                  Update: {
                    "fetched_at"?: string,"next_cursor"?: string | null,"provider"?: string,"query_key"?: string,"result_count"?: number,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_track_choices": {
                  Row: {
                    "job_id": string,"track": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "job_id": string,"track"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "job_id"?: string,"track"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_track_choices_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_user_states": {
                  Row: {
                    "applied_at": string | null,"job_id": string,"status": Database["public"]['Enums']["job_user_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string | null,"job_id": string,"status": Database["public"]['Enums']["job_user_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "applied_at"?: string | null,"job_id"?: string,"status"?: Database["public"]['Enums']["job_user_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_user_states_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "apply_url": string | null,"canonical_url": string | null,"city": string | null,"closed_at": string | null,"company": string | null,"countries": (string)[],"country": string | null,"created_at": string,"date_note": string | null,"date_source": string,"dedupe_key": string | null,"department": string | null,"desc_fingerprint": string | null,"description": string,"description_head": string | null,"description_is_partial": boolean,"employer_id": string | null,"employment_type": string | null,"experience_level": string | null,"external_id": string,"final_url": string | null,"first_seen_at": string,"fts": unknown,"id": string,"last_seen_at": string,"level_source": string | null,"location_text": string | null,"posted_at": string,"provider_key": string | null,"province": string | null,"remote": boolean,"salary": string | null,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"salary_period": string | null,"source": string,"source_url": string | null,"title": string,"updated_at": string,"user_id": string | null,"verification_note": string | null,"verification_status": Database["public"]['Enums']["job_verification_status"],"verified_at": string | null,"workplace_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_url"?: string | null,"canonical_url"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company"?: string | null,"countries"?: (string)[],"country"?: string | null,"created_at"?: string,"date_note"?: string | null,"date_source"?: string,"dedupe_key"?: string | null,"department"?: string | null,"desc_fingerprint"?: string | null,"description"?: string,"description_head"?: never,"description_is_partial"?: boolean,"employer_id"?: string | null,"employment_type"?: string | null,"experience_level"?: string | null,"external_id": string,"final_url"?: string | null,"first_seen_at"?: string,"fts"?: never,"id"?: string,"last_seen_at"?: string,"level_source"?: string | null,"location_text"?: string | null,"posted_at": string,"provider_key"?: string | null,"province"?: string | null,"remote"?: boolean,"salary"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source"?: string,"source_url"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string | null,"verification_note"?: string | null,"verification_status"?: Database["public"]['Enums']["job_verification_status"],"verified_at"?: string | null,"workplace_type"?: string | null
                  }
                  Update: {
                    "apply_url"?: string | null,"canonical_url"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company"?: string | null,"countries"?: (string)[],"country"?: string | null,"created_at"?: string,"date_note"?: string | null,"date_source"?: string,"dedupe_key"?: string | null,"department"?: string | null,"desc_fingerprint"?: string | null,"description"?: string,"description_head"?: never,"description_is_partial"?: boolean,"employer_id"?: string | null,"employment_type"?: string | null,"experience_level"?: string | null,"external_id"?: string,"final_url"?: string | null,"first_seen_at"?: string,"fts"?: never,"id"?: string,"last_seen_at"?: string,"level_source"?: string | null,"location_text"?: string | null,"posted_at"?: string,"provider_key"?: string | null,"province"?: string | null,"remote"?: boolean,"salary"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source"?: string,"source_url"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string | null,"verification_note"?: string | null,"verification_status"?: Database["public"]['Enums']["job_verification_status"],"verified_at"?: string | null,"workplace_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_employer_id_fkey"
      columns: ["employer_id"]
isOneToOne: false
      referencedRelation: "employers"
      referencedColumns: ["id"]
    }
                  ]
                },"known_connections": {
                  Row: {
                    "company": string | null,"connected_on": string | null,"created_at": string,"first_name": string | null,"full_name": string,"id": string,"last_name": string | null,"linkedin_key": string | null,"linkedin_url": string | null,"normalized_name": string,"position": string | null,"source": Database["public"]['Enums']["known_connection_source"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company"?: string | null,"connected_on"?: string | null,"created_at"?: string,"first_name"?: string | null,"full_name": string,"id"?: string,"last_name"?: string | null,"linkedin_key"?: string | null,"linkedin_url"?: string | null,"normalized_name": string,"position"?: string | null,"source"?: Database["public"]['Enums']["known_connection_source"],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "company"?: string | null,"connected_on"?: string | null,"created_at"?: string,"first_name"?: string | null,"full_name"?: string,"id"?: string,"last_name"?: string | null,"linkedin_key"?: string | null,"linkedin_url"?: string | null,"normalized_name"?: string,"position"?: string | null,"source"?: Database["public"]['Enums']["known_connection_source"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"network_connection_overrides": {
                  Row: {
                    "created_at": string,"id": string,"identity_signature": string,"known_connection_id": string | null,"same_person": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"identity_signature": string,"known_connection_id"?: string | null,"same_person": boolean,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"identity_signature"?: string,"known_connection_id"?: string | null,"same_person"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_connection_overrides_known_connection_id_user_id_fkey"
      columns: ["known_connection_id","user_id"]
isOneToOne: false
      referencedRelation: "known_connections"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_feedback": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["person_feedback_kind"],"person_id": string,"search_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["person_feedback_kind"],"person_id": string,"search_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["person_feedback_kind"],"person_id"?: string,"search_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_feedback_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_feedback_search_id_user_id_fkey"
      columns: ["search_id","user_id"]
isOneToOne: false
      referencedRelation: "network_searches"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_interactions": {
                  Row: {
                    "application_id": string | null,"body": string | null,"created_at": string,"id": string,"kind": string,"occurred_at": string,"person_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"occurred_at"?: string,"person_id": string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"occurred_at"?: string,"person_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_interactions_application_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_interactions_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_people": {
                  Row: {
                    "candidate_id": string | null,"category": string | null,"confidence_score": number | null,"conversation_angle": string | null,"created_at": string,"crm_status": Database["public"]['Enums']["network_person_status"],"current_company": string | null,"current_title": string | null,"first_name": string | null,"full_name": string,"github_login": string | null,"github_url": string | null,"headline": string | null,"id": string,"identity_keys": (string)[],"known_connection_id": string | null,"known_match_confidence": number | null,"known_match_state": Database["public"]['Enums']["known_match_state"],"last_name": string | null,"linkedin_key": string | null,"linkedin_url": string | null,"location": string | null,"networking_value_score": number | null,"normalized_name": string,"notes": string | null,"personal_website": string | null,"possible_duplicate_of": string | null,"proximity": Database["public"]['Enums']["network_proximity"],"reason_for_connecting": string | null,"reasons": (string)[],"relevance_score": number | null,"reminder_at": string | null,"saved": boolean,"score_breakdown": NonNullable<Json>,"tags": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id"?: string | null,"category"?: string | null,"confidence_score"?: number | null,"conversation_angle"?: string | null,"created_at"?: string,"crm_status"?: Database["public"]['Enums']["network_person_status"],"current_company"?: string | null,"current_title"?: string | null,"first_name"?: string | null,"full_name": string,"github_login"?: string | null,"github_url"?: string | null,"headline"?: string | null,"id"?: string,"identity_keys"?: (string)[],"known_connection_id"?: string | null,"known_match_confidence"?: number | null,"known_match_state"?: Database["public"]['Enums']["known_match_state"],"last_name"?: string | null,"linkedin_key"?: string | null,"linkedin_url"?: string | null,"location"?: string | null,"networking_value_score"?: number | null,"normalized_name": string,"notes"?: string | null,"personal_website"?: string | null,"possible_duplicate_of"?: string | null,"proximity"?: Database["public"]['Enums']["network_proximity"],"reason_for_connecting"?: string | null,"reasons"?: (string)[],"relevance_score"?: number | null,"reminder_at"?: string | null,"saved"?: boolean,"score_breakdown"?: NonNullable<Json>,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "candidate_id"?: string | null,"category"?: string | null,"confidence_score"?: number | null,"conversation_angle"?: string | null,"created_at"?: string,"crm_status"?: Database["public"]['Enums']["network_person_status"],"current_company"?: string | null,"current_title"?: string | null,"first_name"?: string | null,"full_name"?: string,"github_login"?: string | null,"github_url"?: string | null,"headline"?: string | null,"id"?: string,"identity_keys"?: (string)[],"known_connection_id"?: string | null,"known_match_confidence"?: number | null,"known_match_state"?: Database["public"]['Enums']["known_match_state"],"last_name"?: string | null,"linkedin_key"?: string | null,"linkedin_url"?: string | null,"location"?: string | null,"networking_value_score"?: number | null,"normalized_name"?: string,"notes"?: string | null,"personal_website"?: string | null,"possible_duplicate_of"?: string | null,"proximity"?: Database["public"]['Enums']["network_proximity"],"reason_for_connecting"?: string | null,"reasons"?: (string)[],"relevance_score"?: number | null,"reminder_at"?: string | null,"saved"?: boolean,"score_breakdown"?: NonNullable<Json>,"tags"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_people_candidate_id_user_id_fkey"
      columns: ["candidate_id","user_id"]
isOneToOne: false
      referencedRelation: "candidates"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_people_known_connection_id_user_id_fkey"
      columns: ["known_connection_id","user_id"]
isOneToOne: false
      referencedRelation: "known_connections"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_people_possible_duplicate_of_user_id_fkey"
      columns: ["possible_duplicate_of","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_person_facts": {
                  Row: {
                    "confidence": Database["public"]['Enums']["evidence_confidence"],"created_at": string,"extracted_text": string,"field": Database["public"]['Enums']["network_fact_field"],"id": string,"person_id": string,"query_id": string | null,"source_id": string | null,"source_title": string | null,"source_url": string,"user_id": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": Database["public"]['Enums']["evidence_confidence"],"created_at"?: string,"extracted_text": string,"field": Database["public"]['Enums']["network_fact_field"],"id"?: string,"person_id": string,"query_id"?: string | null,"source_id"?: string | null,"source_title"?: string | null,"source_url": string,"user_id"?: string,"value": string
                  }
                  Update: {
                    "confidence"?: Database["public"]['Enums']["evidence_confidence"],"created_at"?: string,"extracted_text"?: string,"field"?: Database["public"]['Enums']["network_fact_field"],"id"?: string,"person_id"?: string,"query_id"?: string | null,"source_id"?: string | null,"source_title"?: string | null,"source_url"?: string,"user_id"?: string,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_person_facts_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_person_facts_query_id_user_id_fkey"
      columns: ["query_id","user_id"]
isOneToOne: false
      referencedRelation: "network_search_queries"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_person_facts_source_id_user_id_fkey"
      columns: ["source_id","user_id"]
isOneToOne: false
      referencedRelation: "network_sources"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_search_cache": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"provider": string,"query_hash": string,"results": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"provider": string,"query_hash": string,"results": NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"provider"?: string,"query_hash"?: string,"results"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"network_search_people": {
                  Row: {
                    "confidence_score": number | null,"created_at": string,"id": string,"person_id": string,"query_id": string | null,"reasons": (string)[],"relevance_score": number | null,"score_breakdown": NonNullable<Json>,"search_id": string,"tier": Database["public"]['Enums']["search_person_tier"],"tier_reason": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence_score"?: number | null,"created_at"?: string,"id"?: string,"person_id": string,"query_id"?: string | null,"reasons"?: (string)[],"relevance_score"?: number | null,"score_breakdown"?: NonNullable<Json>,"search_id": string,"tier"?: Database["public"]['Enums']["search_person_tier"],"tier_reason"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "confidence_score"?: number | null,"created_at"?: string,"id"?: string,"person_id"?: string,"query_id"?: string | null,"reasons"?: (string)[],"relevance_score"?: number | null,"score_breakdown"?: NonNullable<Json>,"search_id"?: string,"tier"?: Database["public"]['Enums']["search_person_tier"],"tier_reason"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_search_people_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "network_people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_search_people_query_id_user_id_fkey"
      columns: ["query_id","user_id"]
isOneToOne: false
      referencedRelation: "network_search_queries"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "network_search_people_search_id_user_id_fkey"
      columns: ["search_id","user_id"]
isOneToOne: false
      referencedRelation: "network_searches"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_search_queries": {
                  Row: {
                    "created_at": string,"error": string | null,"executed_at": string | null,"family": string,"id": string,"provider": string,"query": string,"result_count": number | null,"search_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"executed_at"?: string | null,"family": string,"id"?: string,"provider": string,"query": string,"result_count"?: number | null,"search_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"executed_at"?: string | null,"family"?: string,"id"?: string,"provider"?: string,"query"?: string,"result_count"?: number | null,"search_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_search_queries_search_id_user_id_fkey"
      columns: ["search_id","user_id"]
isOneToOne: false
      referencedRelation: "network_searches"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_searches": {
                  Row: {
                    "budget": NonNullable<Json>,"counters": NonNullable<Json>,"created_at": string,"criteria": Json | null,"error": string | null,"finished_at": string | null,"id": string,"lease_until": string | null,"metrics": NonNullable<Json>,"original_query": string,"parent_search_id": string | null,"stage": string,"started_at": string | null,"state": NonNullable<Json>,"status": Database["public"]['Enums']["network_search_status"],"target_count": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: NonNullable<Json>,"counters"?: NonNullable<Json>,"created_at"?: string,"criteria"?: Json | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"lease_until"?: string | null,"metrics"?: NonNullable<Json>,"original_query": string,"parent_search_id"?: string | null,"stage"?: string,"started_at"?: string | null,"state"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["network_search_status"],"target_count": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "budget"?: NonNullable<Json>,"counters"?: NonNullable<Json>,"created_at"?: string,"criteria"?: Json | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"lease_until"?: string | null,"metrics"?: NonNullable<Json>,"original_query"?: string,"parent_search_id"?: string | null,"stage"?: string,"started_at"?: string | null,"state"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["network_search_status"],"target_count"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "network_searches_parent_search_id_user_id_fkey"
      columns: ["parent_search_id","user_id"]
isOneToOne: false
      referencedRelation: "network_searches"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"network_sources": {
                  Row: {
                    "expires_at": string,"fetched_at": string,"id": string,"links": (string)[],"provider": string,"text_excerpt": string | null,"title": string | null,"url": string,"url_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at": string,"fetched_at"?: string,"id"?: string,"links"?: (string)[],"provider": string,"text_excerpt"?: string | null,"title"?: string | null,"url": string,"url_hash": string,"user_id"?: string
                  }
                  Update: {
                    "expires_at"?: string,"fetched_at"?: string,"id"?: string,"links"?: (string)[],"provider"?: string,"text_excerpt"?: string | null,"title"?: string | null,"url"?: string,"url_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string,"href": string | null,"id": string,"kind": string,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key": string,"href"?: string | null,"id"?: string,"kind": string,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string,"href"?: string | null,"id"?: string,"kind"?: string,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"count": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"count"?: number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"resume_lines": {
                  Row: {
                    "embedding": string | null,"line_id": string,"resume_id": string,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "embedding"?: string | null,"line_id": string,"resume_id": string,"text": string,"user_id"?: string
                  }
                  Update: {
                    "embedding"?: string | null,"line_id"?: string,"resume_id"?: string,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resume_lines_resume_id_user_id_fkey"
      columns: ["resume_id","user_id"]
isOneToOne: false
      referencedRelation: "resumes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"resumes": {
                  Row: {
                    "created_at": string,"facts": NonNullable<Json>,"field_meta": NonNullable<Json>,"file_name": string | null,"id": string,"is_active": boolean,"label": string,"original_file_path": string | null,"original_profile": Json | null,"parsed_with": string,"previous_profile": Json | null,"profile": NonNullable<Json>,"raw_text": string,"source_kind": string,"track": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"facts"?: NonNullable<Json>,"field_meta"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"is_active"?: boolean,"label": string,"original_file_path"?: string | null,"original_profile"?: Json | null,"parsed_with": string,"previous_profile"?: Json | null,"profile": NonNullable<Json>,"raw_text": string,"source_kind"?: string,"track"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"facts"?: NonNullable<Json>,"field_meta"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"is_active"?: boolean,"label"?: string,"original_file_path"?: string | null,"original_profile"?: Json | null,"parsed_with"?: string,"previous_profile"?: Json | null,"profile"?: NonNullable<Json>,"raw_text"?: string,"source_kind"?: string,"track"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rum_vitals": {
                  Row: {
                    "created_at": string,"device": string,"id": number,"metric": string,"rating": string | null,"route": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"device": string,"id"?: never,"metric": string,"rating"?: string | null,"route": string,"value": number
                  }
                  Update: {
                    "created_at"?: string,"device"?: string,"id"?: never,"metric"?: string,"rating"?: string | null,"route"?: string,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"saved_search_matches": {
                  Row: {
                    "first_matched_at": string,"job_id": string,"notification_id": string | null,"saved_search_id": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "first_matched_at"?: string,"job_id": string,"notification_id"?: string | null,"saved_search_id": string,"status": string,"user_id"?: string
                  }
                  Update: {
                    "first_matched_at"?: string,"job_id"?: string,"notification_id"?: string | null,"saved_search_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_search_matches_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_search_matches_notification_id_user_id_fkey"
      columns: ["notification_id","user_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "saved_search_matches_saved_search_id_user_id_fkey"
      columns: ["saved_search_id","user_id"]
isOneToOne: false
      referencedRelation: "saved_searches"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "alert_frequency": string,"alert_hour": number,"alert_weekday": number,"baseline_at": string | null,"created_at": string,"email_digest": boolean,"id": string,"last_error": string | null,"last_run_at": string | null,"lease_until": string | null,"name": string,"next_run_at": string | null,"query": NonNullable<Json>,"query_version": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_frequency"?: string,"alert_hour"?: number,"alert_weekday"?: number,"baseline_at"?: string | null,"created_at"?: string,"email_digest"?: boolean,"id"?: string,"last_error"?: string | null,"last_run_at"?: string | null,"lease_until"?: string | null,"name": string,"next_run_at"?: string | null,"query": NonNullable<Json>,"query_version"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "alert_frequency"?: string,"alert_hour"?: number,"alert_weekday"?: number,"baseline_at"?: string | null,"created_at"?: string,"email_digest"?: boolean,"id"?: string,"last_error"?: string | null,"last_run_at"?: string | null,"lease_until"?: string | null,"name"?: string,"next_run_at"?: string | null,"query"?: NonNullable<Json>,"query_version"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"saved_views": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"page": string,"query": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"page": string,"query"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"page"?: string,"query"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "auto_approve": boolean,"baseline_connections": number | null,"created_at": string,"daily_invite_target": number | null,"density": string,"email_notifications": boolean,"job_country": string,"job_exclude_keywords": (string)[],"job_provinces": (string)[],"job_titles": (string)[],"locale": string | null,"monthly_note_allowance": number | null,"my_interests": string | null,"my_program_text": string | null,"my_school_text": string | null,"networking_goal": string | null,"no_response_days": number,"note_char_limit": number,"notify_interviews": boolean,"notify_reminders": boolean,"onboarding": NonNullable<Json>,"overall_target": number | null,"pause_reason": string | null,"paused": boolean,"paused_at": string | null,"project_start_date": string,"sample_data": boolean,"stale_pending_days": number,"text_size": string,"theme": string,"timezone": string,"updated_at": string,"user_id": string,"weekly_invite_cap": number | null,"weekly_summary": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"created_at"?: string,"daily_invite_target"?: number | null,"density"?: string,"email_notifications"?: boolean,"job_country"?: string,"job_exclude_keywords"?: (string)[],"job_provinces"?: (string)[],"job_titles"?: (string)[],"locale"?: string | null,"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"no_response_days"?: number,"note_char_limit"?: number,"notify_interviews"?: boolean,"notify_reminders"?: boolean,"onboarding"?: NonNullable<Json>,"overall_target"?: number | null,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"sample_data"?: boolean,"stale_pending_days"?: number,"text_size"?: string,"theme"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null,"weekly_summary"?: boolean
                  }
                  Update: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"created_at"?: string,"daily_invite_target"?: number | null,"density"?: string,"email_notifications"?: boolean,"job_country"?: string,"job_exclude_keywords"?: (string)[],"job_provinces"?: (string)[],"job_titles"?: (string)[],"locale"?: string | null,"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"no_response_days"?: number,"note_char_limit"?: number,"notify_interviews"?: boolean,"notify_reminders"?: boolean,"onboarding"?: NonNullable<Json>,"overall_target"?: number | null,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"sample_data"?: boolean,"stale_pending_days"?: number,"text_size"?: string,"theme"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null,"weekly_summary"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"tailored_documents": {
                  Row: {
                    "comparison": Json | null,"created_at": string,"deleted_at": string | null,"edited": Json | null,"generated": NonNullable<Json>,"guard_report": NonNullable<Json>,"id": string,"kind": Database["public"]['Enums']["tailored_doc_kind"],"label": string | null,"match_id": string,"method": string,"mode": Database["public"]['Enums']["tailor_mode"],"resume_id": string | null,"resume_updated_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comparison"?: Json | null,"created_at"?: string,"deleted_at"?: string | null,"edited"?: Json | null,"generated": NonNullable<Json>,"guard_report"?: NonNullable<Json>,"id"?: string,"kind": Database["public"]['Enums']["tailored_doc_kind"],"label"?: string | null,"match_id": string,"method"?: string,"mode"?: Database["public"]['Enums']["tailor_mode"],"resume_id"?: string | null,"resume_updated_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "comparison"?: Json | null,"created_at"?: string,"deleted_at"?: string | null,"edited"?: Json | null,"generated"?: NonNullable<Json>,"guard_report"?: NonNullable<Json>,"id"?: string,"kind"?: Database["public"]['Enums']["tailored_doc_kind"],"label"?: string | null,"match_id"?: string,"method"?: string,"mode"?: Database["public"]['Enums']["tailor_mode"],"resume_id"?: string | null,"resume_updated_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tailored_documents_match_id_user_id_fkey"
      columns: ["match_id","user_id"]
isOneToOne: false
      referencedRelation: "job_matches"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tailored_documents_resume_fkey"
      columns: ["resume_id","user_id"]
isOneToOne: false
      referencedRelation: "resumes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"targets": {
                  Row: {
                    "created_at": string,"discipline": string,"id": string,"is_sample": boolean,"target_count": number,"university": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discipline": string,"id"?: string,"is_sample"?: boolean,"target_count": number,"university"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"discipline"?: string,"id"?: string,"is_sample"?: boolean,"target_count"?: number,"university"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "targets_discipline_owned"
      columns: ["discipline","user_id"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "targets_university_owned"
      columns: ["university","user_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"universities": {
                  Row: {
                    "aliases": (string)[],"created_at": string,"has_targets": boolean,"id": string,"is_sample": boolean,"name": string,"position": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"created_at"?: string,"has_targets"?: boolean,"id"?: string,"is_sample"?: boolean,"name": string,"position"?: number,"user_id"?: string
                  }
                  Update: {
                    "aliases"?: (string)[],"created_at"?: string,"has_targets"?: boolean,"id"?: string,"is_sample"?: boolean,"name"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_ai": {
                  Row: {
                    "own_key_ciphertext": string | null,"own_key_hint": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "own_key_ciphertext"?: string | null,"own_key_hint"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "own_key_ciphertext"?: string | null,"own_key_hint"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "candidate_category_counts": {
                  Row: {
                    "candidate_count": number | null,"classified": boolean | null,"discipline": string | null,"status": Database["public"]['Enums']["candidate_status"] | null,"university": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "candidates_discipline_owned"
      columns: ["discipline","user_id"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "candidates_university_owned"
      columns: ["university","user_id"]
isOneToOne: false
      referencedRelation: "universities"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Functions: {
            "application_stage_closed":
{ Args: { "p_stage": Database["public"]['Enums']["application_stage"] }; Returns: boolean
                           },
"apply_again":
{ Args: { "p_id": string,"p_stage"?: Database["public"]['Enums']["application_stage"] }; Returns: string
                           },
"claim_due_saved_searches":
{ Args: { "p_lease_seconds": number,"p_limit": number }; Returns: {
              "alert_frequency": string,
"alert_hour": number,
"alert_weekday": number,
"baseline_at": string | null,
"created_at": string,
"email_digest": boolean,
"id": string,
"last_error": string | null,
"last_run_at": string | null,
"lease_until": string | null,
"name": string,
"next_run_at": string | null,
"query": NonNullable<Json>,
"query_version": number,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "saved_searches"
        isOneToOne: false
        isSetofReturn: true
      } },
"clear_sample_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"consume_ai_quota":
{ Args: { "p_limit": number,"p_user": string }; Returns: boolean
                           },
"delete_invitation":
{ Args: { "p_candidate_id": string }; Returns: undefined
                           },
"deliver_alert":
{ Args: { "p_href": string,"p_label": string,"p_run_key": string,"p_search": string }; Returns: string
                           },
"hit_rate_limit":
{ Args: { "p_bucket": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"job_search_countries":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"line_relevance":
{ Args: { "p_job": string,"p_resume": string }; Returns: {
              "line_id": string,"similarity": number
            }[]
                           },
"match_jobs":
{ Args: { "p_jobs": (string)[],"p_resume": string }; Returns: {
              "idx": number,"job_id": string,"line_id": string,"similarity": number
            }[]
                           },
"monitoring_vitals":
{ Args: { "p_days"?: number }; Returns: {
              "device": string,"metric": string,"p75": number,"poor_share": number,"route": string,"samples": number
            }[]
                           },
"notify_user":
{ Args: { "p_body": string,"p_data"?: Json,"p_dedupe": string,"p_href": string,"p_kind": string,"p_title": string,"p_user": string }; Returns: string
                           },
"pending_requirement_embeddings":
{ Args: { "p_limit": number }; Returns: {
              "idx": number,"job_id": string,"text": string
            }[]
                           },
"prune_jobs":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"prune_monitoring":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"prune_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"prune_rate_limits":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"record_client_error":
{ Args: { "p_digest": string,"p_fingerprint": string,"p_message": string,"p_route": string,"p_source": string,"p_stack": string }; Returns: boolean
                           },
"record_invitation_sent":
{ Args: { "p_candidate_id": string,"p_note_text"?: string,"p_sent_at"?: string,"p_source"?: Database["public"]['Enums']["record_source"] }; Returns: string
                           },
"record_referral":
{ Args: { "p_application": string,"p_kind": string,"p_person": string }; Returns: boolean
                           },
"record_vital":
{ Args: { "p_device": string,"p_metric": string,"p_rating": string,"p_route": string,"p_value": number }; Returns: boolean
                           },
"release_application_for_job":
{ Args: { "p_job": string }; Returns: boolean
                           },
"resolve_invitation":
{ Args: { "p_candidate_id": string,"p_outcome": Database["public"]['Enums']["invitation_outcome"],"p_resolved_at"?: string }; Returns: undefined
                           },
"seed_sample_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_application_stage":
{ Args: { "p_detail"?: string,"p_expected_version": number,"p_id": string,"p_occurred_at"?: string,"p_stage": Database["public"]['Enums']["application_stage"] }; Returns: number
                           },
"suggest_follow_ups":
{ Args: { "p_accepted_on": string,"p_candidate": string,"p_sample": boolean,"p_user": string }; Returns: undefined
                           },
"sync_application_for_job":
{ Args: { "p_job": string,"p_stage": Database["public"]['Enums']["application_stage"] }; Returns: string
                           },
"undo_referral":
{ Args: { "p_application": string,"p_kind": string,"p_person": string }; Returns: boolean
                           },
"user_local_date":
{ Args: { "p_at": string }; Returns: string
                           }
          }
          Enums: {
            "application_stage": "saved"|"applied"|"screening"|"interviewing"|"offer"|"accepted"|"rejected"|"withdrawn"|"no_response","ats_kind": "greenhouse"|"lever"|"ashby"|"smartrecruiters"|"workable"|"recruitee"|"fixture"|"workday","candidate_source": "manual"|"csv"|"linkedin_export","candidate_status": "new"|"awaiting_review"|"approved"|"invitation_sent"|"invitation_pending"|"connected"|"declined_withdrawn"|"not_a_match"|"do_not_contact","classification_confidence": "confirmed"|"needs_review","connection_source": "invitation"|"export","degree_level": "undergraduate"|"masters"|"doctoral"|"alumni"|"other","employer_status": "active"|"failing"|"disabled","evidence_confidence": "high"|"medium"|"low","invitation_outcome": "pending"|"accepted"|"declined"|"withdrawn","job_fit_tier": "strong"|"good"|"stretch"|"excluded","job_status": "running"|"succeeded"|"failed","job_user_status": "saved"|"applied"|"dismissed","job_verification_status": "verified"|"expired"|"unavailable"|"failed_validation"|"pending_validation","known_connection_source": "csv"|"linkedin_export"|"manual","known_match_state": "none"|"auto_hidden"|"needs_review"|"confirmed_same"|"confirmed_different","network_fact_field": "institution"|"program"|"degree"|"grad_year"|"role"|"company"|"location"|"github"|"website"|"linkedin","network_person_status": "discovered"|"shortlisted"|"ready_to_connect"|"connection_sent_manually"|"connected"|"replied"|"follow_up"|"archived"|"not_relevant","network_proximity": "connected"|"not_connected"|"unknown"|"manual_second"|"manual_third","network_search_status": "queued"|"running"|"completed"|"failed"|"cancelled","person_feedback_kind": "great_match"|"not_relevant"|"already_connected"|"wrong_person"|"wrong_program","queue_item_state": "queued"|"sent"|"skipped","record_source": "manual"|"linkedin_export","search_person_tier": "verified"|"possible"|"hidden_connected"|"rejected","tailor_mode": "normal"|"apply_anyway","tailored_doc_kind": "resume"|"cover_letter"|"cv"
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
            "application_stage": ["saved", "applied", "screening", "interviewing", "offer", "accepted", "rejected", "withdrawn", "no_response"],"ats_kind": ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "fixture", "workday"],"candidate_source": ["manual", "csv", "linkedin_export"],"candidate_status": ["new", "awaiting_review", "approved", "invitation_sent", "invitation_pending", "connected", "declined_withdrawn", "not_a_match", "do_not_contact"],"classification_confidence": ["confirmed", "needs_review"],"connection_source": ["invitation", "export"],"degree_level": ["undergraduate", "masters", "doctoral", "alumni", "other"],"employer_status": ["active", "failing", "disabled"],"evidence_confidence": ["high", "medium", "low"],"invitation_outcome": ["pending", "accepted", "declined", "withdrawn"],"job_fit_tier": ["strong", "good", "stretch", "excluded"],"job_status": ["running", "succeeded", "failed"],"job_user_status": ["saved", "applied", "dismissed"],"job_verification_status": ["verified", "expired", "unavailable", "failed_validation", "pending_validation"],"known_connection_source": ["csv", "linkedin_export", "manual"],"known_match_state": ["none", "auto_hidden", "needs_review", "confirmed_same", "confirmed_different"],"network_fact_field": ["institution", "program", "degree", "grad_year", "role", "company", "location", "github", "website", "linkedin"],"network_person_status": ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"],"network_proximity": ["connected", "not_connected", "unknown", "manual_second", "manual_third"],"network_search_status": ["queued", "running", "completed", "failed", "cancelled"],"person_feedback_kind": ["great_match", "not_relevant", "already_connected", "wrong_person", "wrong_program"],"queue_item_state": ["queued", "sent", "skipped"],"record_source": ["manual", "linkedin_export"],"search_person_tier": ["verified", "possible", "hidden_connected", "rejected"],"tailor_mode": ["normal", "apply_anyway"],"tailored_doc_kind": ["resume", "cover_letter", "cv"]
          }
        }
} as const
