import { HomeWorkspace } from "@/components/home-workspace";
import { listKnowledgeRecords } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import { getIntegrationStatus } from "@/lib/sync";
import { getTodoStats } from "@/lib/todos";
import { requireUserId } from "@/lib/supabase/server";

export default async function Home() {
  const userId = await requireUserId();
  const [{ records, total }, integrationStatus, integrationSettings, todoStats] = await Promise.all([
    listKnowledgeRecords(userId, { limit: 20, offset: 0 }),
    getIntegrationStatus(userId),
    getIntegrationSettings(userId),
    getTodoStats(userId),
  ]);

  return (
    <HomeWorkspace
      initialRecords={records}
      initialTotal={total}
      initialPendingTodoCount={todoStats.pendingTodos}
      integrationSettings={integrationSettings}
      integrationStatus={integrationStatus}
    />
  );
}
