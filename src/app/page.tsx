import { HomeWorkspace } from "@/components/home-workspace";
import { listKnowledgeRecords } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import { getIntegrationStatus } from "@/lib/sync";

export default function Home() {
  const records = listKnowledgeRecords(9);
  const integrationStatus = getIntegrationStatus();
  const integrationSettings = getIntegrationSettings();

  return (
    <HomeWorkspace
      records={records}
      integrationSettings={integrationSettings}
      integrationStatus={integrationStatus}
    />
  );
}
