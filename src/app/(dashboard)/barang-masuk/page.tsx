import { StockInCrud } from "@/components/features/StockInCrud";

export default function BarangMasukPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Barang Masuk</h1>
        <p className="text-muted-foreground text-sm">Pencatatan unit masuk berdasarkan pemasok.</p>
      </div>

      <StockInCrud />
    </section>
  );
}
