import { StockOutCrud } from "@/components/features/StockOutCrud";

export default function BarangKeluarPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Barang Keluar</h1>
        <p className="text-muted-foreground text-sm">Perhitungan keuntungan otomatis dari harga jual - harga modal.</p>
      </div>

      <StockOutCrud />
    </section>
  );
}
