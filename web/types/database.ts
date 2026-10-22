/**
 * Types générés par Supabase depuis le projet (ne pas modifier à la main).
 * Régénérer après chaque migration : npx supabase gen types typescript --project-id fnypgfyxbyaqrnklhjxc > types/database.ts
 * (puis remettre les deux alias en fin de fichier)
 */
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      follows: {
        Row: {
          created_at: string
          merchant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          merchant_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          merchant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_private: {
        Row: {
          created_at: string
          legal_name: string | null
          merchant_id: string
          naf_code: string | null
          sirene_snapshot: Json | null
          siret: string
          siret_verified_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          legal_name?: string | null
          merchant_id: string
          naf_code?: string | null
          sirene_snapshot?: Json | null
          siret: string
          siret_verified_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          legal_name?: string | null
          merchant_id?: string
          naf_code?: string | null
          sirene_snapshot?: Json | null
          siret?: string
          siret_verified_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_private_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_stats: {
        Row: {
          car_clicks: number
          day: string
          menu_views: number
          merchant_id: string
          phone_clicks: number
          photo_views: number
          story_views: number
          views: number
          walk_clicks: number
        }
        Insert: {
          car_clicks?: number
          day?: string
          menu_views?: number
          merchant_id: string
          phone_clicks?: number
          photo_views?: number
          story_views?: number
          views?: number
          walk_clicks?: number
        }
        Update: {
          car_clicks?: number
          day?: string
          menu_views?: number
          merchant_id?: string
          phone_clicks?: number
          photo_views?: number
          story_views?: number
          views?: number
          walk_clicks?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_stats_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscriptions: {
        Row: {
          merchant_id: string
          mode: string
          started_at: string
          status: string
        }
        Insert: {
          merchant_id: string
          mode?: string
          started_at?: string
          status?: string
        }
        Update: {
          merchant_id?: string
          mode?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_visitors: {
        Row: {
          day: string
          merchant_id: string
          visitor_id: string
        }
        Insert: {
          day: string
          merchant_id: string
          visitor_id: string
        }
        Update: {
          day?: string
          merchant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_visitors_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_visitors_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["merchant_category"]
          created_at: string
          description: string
          honor_at: string | null
          id: string
          is_open: boolean
          is_test: boolean
          lat: number | null
          lng: number | null
          menu_json: Json
          name: string
          opening_hours: Json
          phone: string | null
          photos_urls: string[]
          published_at: string | null
          status: Database["public"]["Enums"]["merchant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          category?: Database["public"]["Enums"]["merchant_category"]
          created_at?: string
          description?: string
          honor_at?: string | null
          id?: string
          is_open?: boolean
          is_test?: boolean
          lat?: number | null
          lng?: number | null
          menu_json?: Json
          name: string
          opening_hours?: Json
          phone?: string | null
          photos_urls?: string[]
          published_at?: string | null
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["merchant_category"]
          created_at?: string
          description?: string
          honor_at?: string | null
          id?: string
          is_open?: boolean
          is_test?: boolean
          lat?: number | null
          lng?: number | null
          menu_json?: Json
          name?: string
          opening_hours?: Json
          phone?: string | null
          photos_urls?: string[]
          published_at?: string | null
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          details: string | null
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["promotion_kind"]
          merchant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["promotion_kind"]
          merchant_id: string
          title: string
        }
        Update: {
          created_at?: string
          details?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["promotion_kind"]
          merchant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          background: string | null
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          image_path: string | null
          merchant_id: string
        }
        Insert: {
          background?: string | null
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_path?: string | null
          merchant_id: string
        }
        Update: {
          background?: string | null
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_path?: string | null
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      in_service_area: { Args: { lat: number; lng: number }; Returns: boolean }
      is_valid_hours: { Args: { hours: Json }; Returns: boolean }
      is_valid_menu: { Args: { menu: Json }; Returns: boolean }
      merchant_follower_count: {
        Args: { p_merchant_id: string }
        Returns: number
      }
      my_merchant: {
        Args: never
        Returns: {
          address: string | null
          category: Database["public"]["Enums"]["merchant_category"]
          created_at: string
          description: string
          honor_at: string | null
          id: string
          is_open: boolean
          is_test: boolean
          lat: number | null
          lng: number | null
          menu_json: Json
          name: string
          opening_hours: Json
          phone: string | null
          photos_urls: string[]
          published_at: string | null
          status: Database["public"]["Enums"]["merchant_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "merchants"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_merchant_stats: {
        Args: { p_days?: number }
        Returns: {
          car_clicks: number
          day: string
          menu_views: number
          new_followers: number
          phone_clicks: number
          photo_views: number
          views: number
          visitors: number
          walk_clicks: number
        }[]
      }
      my_merchant_totals: {
        Args: { p_days?: number }
        Returns: {
          followers: number
          visitors: number
        }[]
      }
      track_merchant_event: {
        Args: { p_event: string; p_merchant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      merchant_category:
        | "food_truck"
        | "kebab"
        | "burger"
        | "sweets"
        | "pizza"
        | "other"
      merchant_status: "draft" | "published" | "suspended"
      promotion_kind: "day" | "week" | "student" | "other"
      user_role: "student" | "merchant"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      merchant_category: [
        "food_truck",
        "kebab",
        "burger",
        "sweets",
        "pizza",
        "other",
      ],
      merchant_status: ["draft", "published", "suspended"],
      promotion_kind: ["day", "week", "student", "other"],
      user_role: ["student", "merchant"],
    },
  },
} as const

// Alias utilisés dans l'application
export type MerchantRecord = Tables<"merchants">
export type ProfileRecord = Tables<"profiles">
export type FollowRecord = Tables<"follows">
export type MerchantStatsRecord = Tables<"merchant_stats">
export type PromotionRecord = Tables<"promotions">
export type StoryRecord = Tables<"stories">
