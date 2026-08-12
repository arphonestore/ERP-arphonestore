import { ActivityDashboard } from "@/components/features/ActivityDashboard";

export default function ActivityPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Activity</h1>
        <p className="text-muted-foreground text-sm">Riwayat aksi sistem untuk stock, barang masuk, dan barang keluar.</p>
      </div>

      <ActivityDashboard />
    </section>
  );
}
