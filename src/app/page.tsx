import { HomeWorkspace } from "@/components/home-workspace";
import { listKnowledgeRecords } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import { getIntegrationStatus } from "@/lib/sync";
import { requireUserId } from "@/lib/supabase/server";

export default async function Home() {
  const userId = await requireUserId();
  const { records, total } = await listKnowledgeRecords(userId, { limit: 20, offset: 0 });
  const integrationStatus = await getIntegrationStatus(userId);
  const integrationSettings = await getIntegrationSettings(userId);

  return (
    <HomeWorkspace
      initialRecords={records}
      initialTotal={total}
      integrationSettings={integrationSettings}
      integrationStatus={integrationStatus}
    />
  );
}
