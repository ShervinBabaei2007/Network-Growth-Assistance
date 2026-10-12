
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
                    "apply_url": string | null,"canonical_url": string | null,"city": string | null,"closed_at": string | null,"company": string | null,"countries": (string)[],"country": string | null,"created_at": string,"date_note": string | null,"date_source": string,"dedupe_key": string | null,"department": string | null,"desc_fingerprint": string | null,"description": string,"description_is_partial": boolean,"employer_id": string | null,"employment_type": string | null,"experience_level": string | null,"external_id": string,"final_url": string | null,"first_seen_at": string,"fts": unknown,"id": string,"last_seen_at": string,"level_source": string | null,"location_text": string | null,"posted_at": string,"provider_key": string | null,"province": string | null,"remote": boolean,"salary": string | null,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"salary_period": string | null,"source": string,"source_url": string | null,"title": string,"updated_at": string,"user_id": string | null,"verification_note": string | null,"verification_status": Database["public"]['Enums']["job_verification_status"],"verified_at": string | null,"workplace_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_url"?: string | null,"canonical_url"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company"?: string | null,"countries"?: (string)[],"country"?: string | null,"created_at"?: string,"date_note"?: string | null,"date_source"?: string,"dedupe_key"?: string | null,"department"?: string | null,"desc_fingerprint"?: string | null,"description"?: string,"description_is_partial"?: boolean,"employer_id"?: string | null,"employment_type"?: string | null,"experience_level"?: string | null,"external_id": string,"final_url"?: string | null,"first_seen_at"?: string,"fts"?: never,"id"?: string,"last_seen_at"?: string,"level_source"?: string | null,"location_text"?: string | null,"posted_at": string,"provider_key"?: string | null,"province"?: string | null,"remote"?: boolean,"salary"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source"?: string,"source_url"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string | null,"verification_note"?: string | null,"verification_status"?: Database["public"]['Enums']["job_verification_status"],"verified_at"?: string | null,"workplace_type"?: string | null
                  }
                  Update: {
                    "apply_url"?: string | null,"canonical_url"?: string | null,"city"?: string | null,"closed_at"?: string | null,"company"?: string | null,"countries"?: (string)[],"country"?: string | null,"created_at"?: string,"date_note"?: string | null,"date_source"?: string,"dedupe_key"?: string | null,"department"?: string | null,"desc_fingerprint"?: string | null,"description"?: string,"description_is_partial"?: boolean,"employer_id"?: string | null,"employment_type"?: string | null,"experience_level"?: string | null,"external_id"?: string,"final_url"?: string | null,"first_seen_at"?: string,"fts"?: never,"id"?: string,"last_seen_at"?: string,"level_source"?: string | null,"location_text"?: string | null,"posted_at"?: string,"provider_key"?: string | null,"province"?: string | null,"remote"?: boolean,"salary"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source"?: string,"source_url"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string | null,"verification_note"?: string | null,"verification_status"?: Database["public"]['Enums']["job_verification_status"],"verified_at"?: string | null,"workplace_type"?: string | null
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
                    "body": string | null,"created_at": string,"id": string,"kind": string,"occurred_at": string,"person_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"occurred_at"?: string,"person_id": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"occurred_at"?: string,"person_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
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
                    "created_at": string,"facts": NonNullable<Json>,"field_meta": NonNullable<Json>,"file_name": string | null,"id": string,"is_active": boolean,"label": string,"original_file_path": string | null,"original_profile": Json | null,"parsed_with": string,"previous_profile": Json | null,"profile": NonNullable<Json>,"raw_text": string,"source_kind": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"facts"?: NonNullable<Json>,"field_meta"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"is_active"?: boolean,"label": string,"original_file_path"?: string | null,"original_profile"?: Json | null,"parsed_with": string,"previous_profile"?: Json | null,"profile": NonNullable<Json>,"raw_text": string,"source_kind"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"facts"?: NonNullable<Json>,"field_meta"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"is_active"?: boolean,"label"?: string,"original_file_path"?: string | null,"original_profile"?: Json | null,"parsed_with"?: string,"previous_profile"?: Json | null,"profile"?: NonNullable<Json>,"raw_text"?: string,"source_kind"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "auto_approve": boolean,"baseline_connections": number | null,"count_ubco_as_ubc": boolean,"created_at": string,"daily_invite_target": number | null,"discipline_priority": (Database["public"]['Enums']["discipline"])[],"job_country": string,"job_exclude_keywords": (string)[],"job_provinces": (string)[],"job_seniority": string,"job_titles": (string)[],"monthly_note_allowance": number | null,"my_interests": string | null,"my_program_text": string | null,"my_school_text": string | null,"networking_goal": string | null,"note_char_limit": number,"overall_target": number,"pause_reason": string | null,"paused": boolean,"paused_at": string | null,"project_start_date": string,"stale_pending_days": number,"timezone": string,"updated_at": string,"user_id": string,"weekly_invite_cap": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"job_country"?: string,"job_exclude_keywords"?: (string)[],"job_provinces"?: (string)[],"job_seniority"?: string,"job_titles"?: (string)[],"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
                  }
                  Update: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"job_country"?: string,"job_exclude_keywords"?: (string)[],"job_provinces"?: (string)[],"job_seniority"?: string,"job_titles"?: (string)[],"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
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
    }
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
                    "candidate_count": number | null,"classified": boolean | null,"discipline": Database["public"]['Enums']["discipline"] | null,"status": Database["public"]['Enums']["candidate_status"] | null,"university": Database["public"]['Enums']["university"] | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "consume_ai_quota":
{ Args: { "p_limit": number,"p_user": string }; Returns: boolean
                           },
"delete_invitation":
{ Args: { "p_candidate_id": string }; Returns: undefined
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
"pending_requirement_embeddings":
{ Args: { "p_limit": number }; Returns: {
              "idx": number,"job_id": string,"text": string
            }[]
                           },
"prune_jobs":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"record_invitation_sent":
{ Args: { "p_candidate_id": string,"p_note_text"?: string,"p_sent_at"?: string,"p_source"?: Database["public"]['Enums']["record_source"] }; Returns: string
                           },
"resolve_invitation":
{ Args: { "p_candidate_id": string,"p_outcome": Database["public"]['Enums']["invitation_outcome"],"p_resolved_at"?: string }; Returns: undefined
                           }
          }
          Enums: {
            "ats_kind": "greenhouse"|"lever"|"ashby"|"smartrecruiters"|"workable"|"recruitee"|"fixture","candidate_source": "manual"|"csv"|"linkedin_export","candidate_status": "new"|"awaiting_review"|"approved"|"invitation_sent"|"invitation_pending"|"connected"|"declined_withdrawn"|"not_a_match"|"do_not_contact","classification_confidence": "confirmed"|"needs_review","connection_source": "invitation"|"export","degree_level": "undergraduate"|"masters"|"doctoral"|"alumni"|"other","discipline": "ce"|"ee"|"mech"|"cs","employer_status": "active"|"failing"|"disabled","evidence_confidence": "high"|"medium"|"low","invitation_outcome": "pending"|"accepted"|"declined"|"withdrawn","job_fit_tier": "strong"|"good"|"stretch"|"excluded","job_status": "running"|"succeeded"|"failed","job_user_status": "saved"|"applied"|"dismissed","job_verification_status": "verified"|"expired"|"unavailable"|"failed_validation"|"pending_validation","known_connection_source": "csv"|"linkedin_export"|"manual","known_match_state": "none"|"auto_hidden"|"needs_review"|"confirmed_same"|"confirmed_different","network_fact_field": "institution"|"program"|"degree"|"grad_year"|"role"|"company"|"location"|"github"|"website"|"linkedin","network_person_status": "discovered"|"shortlisted"|"ready_to_connect"|"connection_sent_manually"|"connected"|"replied"|"follow_up"|"archived"|"not_relevant","network_proximity": "connected"|"not_connected"|"unknown"|"manual_second"|"manual_third","network_search_status": "queued"|"running"|"completed"|"failed"|"cancelled","person_feedback_kind": "great_match"|"not_relevant"|"already_connected"|"wrong_person"|"wrong_program","queue_item_state": "queued"|"sent"|"skipped","record_source": "manual"|"linkedin_export","search_person_tier": "verified"|"possible"|"hidden_connected"|"rejected","tailor_mode": "normal"|"apply_anyway","tailored_doc_kind": "resume"|"cover_letter"|"cv","university": "uoft"|"ubc"|"sfu"|"waterloo"
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
            "ats_kind": ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "fixture"],"candidate_source": ["manual", "csv", "linkedin_export"],"candidate_status": ["new", "awaiting_review", "approved", "invitation_sent", "invitation_pending", "connected", "declined_withdrawn", "not_a_match", "do_not_contact"],"classification_confidence": ["confirmed", "needs_review"],"connection_source": ["invitation", "export"],"degree_level": ["undergraduate", "masters", "doctoral", "alumni", "other"],"discipline": ["ce", "ee", "mech", "cs"],"employer_status": ["active", "failing", "disabled"],"evidence_confidence": ["high", "medium", "low"],"invitation_outcome": ["pending", "accepted", "declined", "withdrawn"],"job_fit_tier": ["strong", "good", "stretch", "excluded"],"job_status": ["running", "succeeded", "failed"],"job_user_status": ["saved", "applied", "dismissed"],"job_verification_status": ["verified", "expired", "unavailable", "failed_validation", "pending_validation"],"known_connection_source": ["csv", "linkedin_export", "manual"],"known_match_state": ["none", "auto_hidden", "needs_review", "confirmed_same", "confirmed_different"],"network_fact_field": ["institution", "program", "degree", "grad_year", "role", "company", "location", "github", "website", "linkedin"],"network_person_status": ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"],"network_proximity": ["connected", "not_connected", "unknown", "manual_second", "manual_third"],"network_search_status": ["queued", "running", "completed", "failed", "cancelled"],"person_feedback_kind": ["great_match", "not_relevant", "already_connected", "wrong_person", "wrong_program"],"queue_item_state": ["queued", "sent", "skipped"],"record_source": ["manual", "linkedin_export"],"search_person_tier": ["verified", "possible", "hidden_connected", "rejected"],"tailor_mode": ["normal", "apply_anyway"],"tailored_doc_kind": ["resume", "cover_letter", "cv"],"university": ["uoft", "ubc", "sfu", "waterloo"]
          }
        }
} as const
