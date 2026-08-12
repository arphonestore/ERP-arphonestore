import { DashboardLive } from "@/components/features/DashboardLive";

export default function DashboardPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Ringkasan performa inventory AR Store.</p>
      </div>

      <DashboardLive />
    </section>
  );
}
