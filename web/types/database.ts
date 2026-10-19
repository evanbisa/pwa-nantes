/**
 * Types de la base, écrits d'après supabase/migrations/20261020090000_init.sql.
 * Une fois le projet créé, les régénérer avec :
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type MerchantRow = {
  id: string;
  user_id: string;
  name: string;
  category: Database["public"]["Enums"]["merchant_category"];
  description: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  opening_hours: Json;
  menu_json: Json;
  photos_urls: string[];
  is_open: boolean;
  status: Database["public"]["Enums"]["merchant_status"];
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // créé par le trigger d'inscription
        Update: { first_name?: string | null; last_name?: string | null; phone?: string | null };
        Relationships: [];
      };
      merchants: {
        Row: MerchantRow;
        Insert: Partial<MerchantRow> & { user_id: string; name: string }; // serveur uniquement
        Update: Partial<
          Pick<
            MerchantRow,
            | "name"
            | "category"
            | "description"
            | "address"
            | "lat"
            | "lng"
            | "phone"
            | "opening_hours"
            | "menu_json"
            | "photos_urls"
            | "is_open"
            | "status"
          >
        >;
        Relationships: [];
      };
      merchant_private: {
        Row: {
          merchant_id: string;
          siret: string;
          siret_verified_at: string | null;
          legal_name: string | null;
          naf_code: string | null;
          sirene_snapshot: Json | null;
          created_at: string;
          updated_at: string;
        };
        // serveur uniquement (clé secrète)
        Insert: { merchant_id: string; siret: string; siret_verified_at?: string | null; legal_name?: string | null; naf_code?: string | null; sirene_snapshot?: Json | null };
        Update: { siret_verified_at?: string | null; legal_name?: string | null; naf_code?: string | null; sirene_snapshot?: Json | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      my_merchant: { Args: Record<PropertyKey, never>; Returns: MerchantRow[] };
      in_service_area: { Args: { lat: number; lng: number }; Returns: boolean };
    };
    Enums: {
      user_role: "student" | "merchant";
      merchant_category: "food_truck" | "kebab" | "burger" | "sweets" | "pizza" | "other";
      merchant_status: "draft" | "published" | "suspended";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type MerchantRecord = Database["public"]["Tables"]["merchants"]["Row"];
export type ProfileRecord = Database["public"]["Tables"]["profiles"]["Row"];
