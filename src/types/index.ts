export type StockStatus = "available" | "sold";

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface AdminProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  session_version: number;
  password_changed_at: string | null;
  updated_at: string;
}

export interface Stock {
  id: string;
  type: string;
  imei: string;
  harga: number;
  status: StockStatus;
  archived_at: string | null;
  created_at: string;
}

export interface StockIn {
  id: string;
  stock_id: string | null;
  type: string;
  imei: string;
  harga: number;
  penjual: string;
  tanggal_masuk: string;
  voided_at: string | null;
  created_at: string;
}

export interface StockOut {
  id: string;
  stock_id: string | null;
  type: string;
  imei: string;
  pembeli: string;
  harga_modal: number;
  harga_jual: number;
  keuntungan: number;
  tanggal_keluar: string;
  voided_at: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  module: string;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ProfileFormInput {
  username: string;
  fullName: string;
  avatarUrl?: string;
  password?: string;
}

export interface StockFormInput {
  type: string;
  imei: string;
  harga: number;
  status: StockStatus;
}

export interface StockInFormInput {
  type: string;
  imei: string;
  harga: number;
  penjual: string;
  tanggalMasuk: string;
}

export interface StockOutFormInput {
  type: string;
  imei: string;
  pembeli: string;
  hargaModal: number;
  hargaJual: number;
  tanggalKeluar: string;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

export type SupabaseSuccess<T> = {
  data: T;
  error: null;
};

export type SupabaseError = {
  message: string;
  code?: string;
  details?: string;
};

export type SupabaseFailure = {
  data: null;
  error: SupabaseError;
};

export type SupabaseResponse<T> = SupabaseSuccess<T> | SupabaseFailure;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          username: string;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Update: {
          username?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stock: {
        Row: Stock;
        Insert: {
          id?: string;
          type: string;
          imei: string;
          harga: number;
          status?: StockStatus;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          type?: string;
          imei?: string;
          harga?: number;
          status?: StockStatus;
          archived_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      stock_in: {
        Row: StockIn;
        Insert: {
          id?: string;
          stock_id?: string | null;
          type: string;
          imei: string;
          harga: number;
          penjual: string;
          tanggal_masuk: string;
          voided_at?: string | null;
          created_at?: string;
        };
        Update: {
          stock_id?: string | null;
          type?: string;
          imei?: string;
          harga?: number;
          penjual?: string;
          tanggal_masuk?: string;
          voided_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      stock_out: {
        Row: StockOut;
        Insert: {
          id?: string;
          stock_id?: string | null;
          type: string;
          imei: string;
          pembeli: string;
          harga_modal: number;
          harga_jual: number;
          tanggal_keluar: string;
          voided_at?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Update: {
          stock_id?: string | null;
          type?: string;
          imei?: string;
          pembeli?: string;
          harga_modal?: number;
          harga_jual?: number;
          tanggal_keluar?: string;
          voided_at?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      activity_logs: {
        Row: ActivityLog;
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          action: string;
          module: string;
          entity_id?: string | null;
          entity_label?: string | null;
          description?: string | null;
          before_data?: Record<string, unknown> | null;
          after_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          actor_id?: string | null;
          actor_name?: string | null;
          action?: string;
          module?: string;
          entity_id?: string | null;
          entity_label?: string | null;
          description?: string | null;
          before_data?: Record<string, unknown> | null;
          after_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_profiles: {
        Row: AdminProfile;
        Insert: {
          id: string;
          username: string;
          full_name?: string | null;
          avatar_url?: string | null;
          password_hash?: string | null;
          session_version?: number;
          password_changed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          username?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          password_hash?: string | null;
          session_version?: number;
          password_changed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
  };
}
