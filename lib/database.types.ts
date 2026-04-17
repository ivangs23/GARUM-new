// ============================================================
// Tipos generados del schema de Supabase — Garum Vinoteca
// Actualizar ejecutando: npx supabase gen types typescript --local
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      allergens: {
        Row: {
          id: number;
          name: string;
          icon: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          icon?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          icon?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          destination: 'cocina' | 'barra';
          icon: string | null;
          sort_order: number;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          destination: 'cocina' | 'barra';
          icon?: string | null;
          sort_order?: number;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          destination?: 'cocina' | 'barra';
          icon?: string | null;
          sort_order?: number;
          parent_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          allergen_ids: number[];
          is_available: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description?: string | null;
          price: number;
          image_url?: string | null;
          allergen_ids?: number[];
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          allergen_ids?: number[];
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          }
        ];
      };
      product_extras: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          price?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          price?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_extras_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          table_number: number;
          items: Json;
          total_amount: number | null;
          payment_status: 'pending' | 'paid' | 'cancelled';
          staff_status: 'pending' | 'done';
          stripe_session_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          table_number: number;
          items?: Json;
          total_amount?: number | null;
          payment_status?: 'pending' | 'paid' | 'cancelled';
          staff_status?: 'pending' | 'done';
          stripe_session_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          table_number?: number;
          items?: Json;
          total_amount?: number | null;
          payment_status?: 'pending' | 'paid' | 'cancelled';
          staff_status?: 'pending' | 'done';
          stripe_session_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: string;
        };
        Insert: {
          key: string;
          value: string;
        };
        Update: {
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      pedidos: {
        Row: {
          id: string;
          order_number: string;
          order_type: string;
          table_number: string | null;
          total_amount: number | null;
          status: string;
          items: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          order_type: string;
          table_number?: string | null;
          total_amount?: number | null;
          status?: string;
          items?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          order_type?: string;
          table_number?: string | null;
          total_amount?: number | null;
          status?: string;
          items?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      next_order_number: {
        Args: { [_ in never]: never };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// ── Tipos derivados de conveniencia ───────────────────────────────────────
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Allergen     = Tables<'allergens'>;
export type Category     = Tables<'categories'>;
export type Product      = Tables<'products'>;
export type ProductExtra = Tables<'product_extras'>;
export type Order        = Tables<'orders'>;
export type Setting      = Tables<'settings'>;
