export interface Database {
  public: {
    Tables: {
      records: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          source_label: string;
          source_channel: string;
          record_type: string;
          content_text: string;
          extracted_text: string;
          summary: string;
          context_note: string;
          keywords: string[];
          action_items: string[];
          suggested_targets: string[];
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          source_label?: string;
          source_channel?: string;
          record_type?: string;
          content_text?: string;
          extracted_text?: string;
          summary?: string;
          context_note?: string;
          keywords?: string[];
          action_items?: string[];
          suggested_targets?: string[];
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          source_label?: string;
          source_channel?: string;
          record_type?: string;
          content_text?: string;
          extracted_text?: string;
          summary?: string;
          context_note?: string;
          keywords?: string[];
          action_items?: string[];
          suggested_targets?: string[];
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          record_id: string;
          user_id: string;
          original_name: string;
          mime_type: string;
          byte_size: number;
          storage_key: string;
          tags: string[];
          description: string;
          ocr_text: string;
          file_hash: string;
          created_at: string;
        };
        Insert: {
          id: string;
          record_id: string;
          user_id: string;
          original_name: string;
          mime_type: string;
          byte_size?: number;
          storage_key: string;
          tags?: string[];
          description?: string;
          ocr_text?: string;
          file_hash?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          record_id?: string;
          user_id?: string;
          original_name?: string;
          mime_type?: string;
          byte_size?: number;
          storage_key?: string;
          tags?: string[];
          description?: string;
          ocr_text?: string;
          file_hash?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      chunks: {
        Row: {
          id: string;
          record_id: string;
          user_id: string;
          chunk_index: number;
          content: string;
          reason: string;
          embedding: string | null;
          tsv: unknown;
          created_at: string;
        };
        Insert: {
          id: string;
          record_id: string;
          user_id: string;
          chunk_index?: number;
          content: string;
          reason?: string;
          embedding?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          record_id?: string;
          user_id?: string;
          chunk_index?: number;
          content?: string;
          reason?: string;
          embedding?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: string;
          record_id: string;
          user_id: string;
          target: string;
          status: string;
          external_ref: string | null;
          payload: Record<string, unknown>;
          message: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          record_id: string;
          user_id: string;
          target: string;
          status: string;
          external_ref?: string | null;
          payload?: Record<string, unknown>;
          message?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          record_id?: string;
          user_id?: string;
          target?: string;
          status?: string;
          external_ref?: string | null;
          payload?: Record<string, unknown>;
          message?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      todos: {
        Row: {
          id: string;
          user_id: string;
          record_id: string | null;
          content: string;
          priority: string;
          status: string;
          sort_order: number;
          synced_at: string | null;
          deleted_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          record_id?: string | null;
          content: string;
          priority?: string;
          status?: string;
          sort_order?: number;
          synced_at?: string | null;
          deleted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          record_id?: string | null;
          content?: string;
          priority?: string;
          status?: string;
          sort_order?: number;
          synced_at?: string | null;
          deleted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          record_id: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          record_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          record_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
