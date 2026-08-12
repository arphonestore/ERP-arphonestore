import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types";

type ActivityAction = "create" | "update" | "delete" | "checkout";
type ActivityModule = "stock" | "stock_in" | "stock_out";

type ActivityUser = {
  id?: string;
  name?: string | null;
  username?: string;
};

type LogActivityInput = {
  supabase: SupabaseClient<Database>;
  user?: ActivityUser;
  action: ActivityAction;
  module: ActivityModule;
  entityId?: string;
  entityLabel?: string;
  description?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
};

export async function logActivity(input: LogActivityInput) {
  const actorName = input.user?.name ?? input.user?.username ?? "Unknown User";

  const { error } = await input.supabase.from("activity_logs").insert(
    {
      actor_id: input.user?.id ?? null,
      actor_name: actorName,
      action: input.action,
      module: input.module,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      description: input.description ?? null,
      before_data: input.beforeData ?? null,
      after_data: input.afterData ?? null,
    } as never
  );

  if (error) {
    console.error("Failed to write activity log:", error.message);
  }
}
