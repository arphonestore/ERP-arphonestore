import { StockCrud } from "@/components/features/StockCrud";

export default function StockPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Stock Barang</h1>
        <p className="text-muted-foreground text-sm">Daftar unit berdasarkan type, imei, harga, dan status.</p>
      </div>

      <StockCrud />
    </section>
  );
}
