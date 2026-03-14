import { ImapFlow } from "imapflow";
import { getIntegrationSettings } from "@/lib/settings";
import { createKnowledgeRecord } from "@/lib/records";

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  tls: boolean;
}

async function getImapConfig(userId: string): Promise<ImapConfig | null> {
  const settings = await getIntegrationSettings(userId);
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    return null;
  }
  return {
    host: settings.imapHost,
    port: Number(settings.imapPort) || 993,
    user: settings.imapUser,
    pass: settings.imapPass,
    tls: settings.imapSecure !== false,
  };
}

export async function fetchNewEmails(
  userId: string,
  maxCount = 10,
): Promise<{ fetched: number; errors: string[] }> {
  const config = await getImapConfig(userId);
  if (!config) return { fetched: 0, errors: ["IMAP 配置不完整"] };

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  let fetched = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const messages = client.fetch(
        { seen: false },
        { source: true, envelope: true, uid: true },
        { changedSince: BigInt(0) },
      );

      let count = 0;
      for await (const msg of messages) {
        if (count >= maxCount) break;
        count++;

        try {
          const subject = msg.envelope?.subject || "邮件收录";
          const from = msg.envelope?.from?.[0]?.address || "email";
          const source = msg.source;
          const bodyText = source ? source.toString("utf-8").slice(0, 5000) : "";
          const textContent = extractTextFromEmail(bodyText);

          await createKnowledgeRecord(
            userId,
            {
              contentText: textContent,
              title: subject,
              sourceLabel: `邮件 · ${from}`,
              contextNote: "通过 IMAP 自动收录",
            },
            [],
          );

          if (msg.uid) {
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
          }
          fetched++;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "处理邮件失败");
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "IMAP 连接失败");
  }

  return { fetched, errors };
}

function extractTextFromEmail(rawSource: string): string {
  const parts = rawSource.split(/\r?\n\r?\n/);
  if (parts.length < 2) return rawSource.slice(0, 2000);

  const body = parts.slice(1).join("\n\n");
  const cleaned = body
    .replace(/<[^>]+>/g, "")
    .replace(/=\r?\n/g, "")
    .replace(/=[0-9A-Fa-f]{2}/g, (m) => {
      try {
        return String.fromCharCode(parseInt(m.slice(1), 16));
      } catch {
        return m;
      }
    })
    .trim();

  return cleaned.slice(0, 3000);
}
