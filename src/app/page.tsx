import { HomeWorkspace } from "@/components/home-workspace";
import { listKnowledgeRecords } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import { getIntegrationStatus } from "@/lib/sync";

export default function Home() {
  const { records, total } = listKnowledgeRecords({ limit: 20, offset: 0 });
  const integrationStatus = getIntegrationStatus();
  const integrationSettings = getIntegrationSettings();

  return (
    <HomeWorkspace
      initialRecords={records}
      initialTotal={total}
      integrationSettings={integrationSettings}
      integrationStatus={integrationStatus}
    />
  );
}
