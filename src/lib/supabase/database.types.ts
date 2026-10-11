
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
                },"settings": {
                  Row: {
                    "auto_approve": boolean,"baseline_connections": number | null,"count_ubco_as_ubc": boolean,"created_at": string,"daily_invite_target": number | null,"discipline_priority": (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance": number | null,"my_interests": string | null,"my_program_text": string | null,"my_school_text": string | null,"networking_goal": string | null,"note_char_limit": number,"overall_target": number,"pause_reason": string | null,"paused": boolean,"paused_at": string | null,"project_start_date": string,"stale_pending_days": number,"timezone": string,"updated_at": string,"user_id": string,"weekly_invite_cap": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
                  }
                  Update: {
                    "auto_approve"?: boolean,"baseline_connections"?: number | null,"count_ubco_as_ubc"?: boolean,"created_at"?: string,"daily_invite_target"?: number | null,"discipline_priority"?: (Database["public"]['Enums']["discipline"])[],"monthly_note_allowance"?: number | null,"my_interests"?: string | null,"my_program_text"?: string | null,"my_school_text"?: string | null,"networking_goal"?: string | null,"note_char_limit"?: number,"overall_target"?: number,"pause_reason"?: string | null,"paused"?: boolean,"paused_at"?: string | null,"project_start_date"?: string,"stale_pending_days"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"weekly_invite_cap"?: number | null
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
            "candidate_source": "manual"|"csv"|"linkedin_export","candidate_status": "new"|"awaiting_review"|"approved"|"invitation_sent"|"invitation_pending"|"connected"|"declined_withdrawn"|"not_a_match"|"do_not_contact","classification_confidence": "confirmed"|"needs_review","connection_source": "invitation"|"export","degree_level": "undergraduate"|"masters"|"doctoral"|"alumni"|"other","discipline": "ce"|"ee"|"mech"|"cs","evidence_confidence": "high"|"medium"|"low","invitation_outcome": "pending"|"accepted"|"declined"|"withdrawn","job_status": "running"|"succeeded"|"failed","known_connection_source": "csv"|"linkedin_export"|"manual","known_match_state": "none"|"auto_hidden"|"needs_review"|"confirmed_same"|"confirmed_different","network_fact_field": "institution"|"program"|"degree"|"grad_year"|"role"|"company"|"location"|"github"|"website"|"linkedin","network_person_status": "discovered"|"shortlisted"|"ready_to_connect"|"connection_sent_manually"|"connected"|"replied"|"follow_up"|"archived"|"not_relevant","network_proximity": "connected"|"not_connected"|"unknown"|"manual_second"|"manual_third","network_search_status": "queued"|"running"|"completed"|"failed"|"cancelled","person_feedback_kind": "great_match"|"not_relevant"|"already_connected"|"wrong_person"|"wrong_program","queue_item_state": "queued"|"sent"|"skipped","record_source": "manual"|"linkedin_export","search_person_tier": "verified"|"possible"|"hidden_connected"|"rejected","university": "uoft"|"ubc"|"sfu"|"waterloo"
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
            "candidate_source": ["manual", "csv", "linkedin_export"],"candidate_status": ["new", "awaiting_review", "approved", "invitation_sent", "invitation_pending", "connected", "declined_withdrawn", "not_a_match", "do_not_contact"],"classification_confidence": ["confirmed", "needs_review"],"connection_source": ["invitation", "export"],"degree_level": ["undergraduate", "masters", "doctoral", "alumni", "other"],"discipline": ["ce", "ee", "mech", "cs"],"evidence_confidence": ["high", "medium", "low"],"invitation_outcome": ["pending", "accepted", "declined", "withdrawn"],"job_status": ["running", "succeeded", "failed"],"known_connection_source": ["csv", "linkedin_export", "manual"],"known_match_state": ["none", "auto_hidden", "needs_review", "confirmed_same", "confirmed_different"],"network_fact_field": ["institution", "program", "degree", "grad_year", "role", "company", "location", "github", "website", "linkedin"],"network_person_status": ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"],"network_proximity": ["connected", "not_connected", "unknown", "manual_second", "manual_third"],"network_search_status": ["queued", "running", "completed", "failed", "cancelled"],"person_feedback_kind": ["great_match", "not_relevant", "already_connected", "wrong_person", "wrong_program"],"queue_item_state": ["queued", "sent", "skipped"],"record_source": ["manual", "linkedin_export"],"search_person_tier": ["verified", "possible", "hidden_connected", "rejected"],"university": ["uoft", "ubc", "sfu", "waterloo"]
          }
        }
} as const
