export type StockStatus = "ready" | "terjual";

export type StockItem = {
  id: string;
  type: string;
  imei: string;
  harga: number;
  status: StockStatus;
};

export type StockInRecord = {
  id: string;
  type: string;
  imei: string;
  penjual: string;
  tanggal_masuk: string;
};

export type StockOutRecord = {
  id: string;
  type: string;
  imei: string;
  pembeli: string;
  harga_modal: number;
  harga_jual: number;
  tanggal_keluar: string;
};

export type ProfileRecord = {
  id: string;
  full_name: string;
  username: string;
  photo_url: string;
};

export type KpiSummary = {
  total_stock: number;
  total_masuk: number;
  total_keluar: number;
  total_keuntungan: number;
};
