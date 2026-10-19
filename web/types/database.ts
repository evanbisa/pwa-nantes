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
      merchants: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["merchant_category"]
          created_at: string
          description: string
          id: string
          is_open: boolean
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
          id?: string
          is_open?: boolean
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
          id?: string
          is_open?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      in_service_area: { Args: { lat: number; lng: number }; Returns: boolean }
      is_valid_hours: { Args: { hours: Json }; Returns: boolean }
      is_valid_menu: { Args: { menu: Json }; Returns: boolean }
      my_merchant: {
        Args: never
        Returns: {
          address: string | null
          category: Database["public"]["Enums"]["merchant_category"]
          created_at: string
          description: string
          id: string
          is_open: boolean
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
      user_role: ["student", "merchant"],
    },
  },
} as const

// Alias utilisés dans l'application
export type MerchantRecord = Tables<"merchants">
export type ProfileRecord = Tables<"profiles">
