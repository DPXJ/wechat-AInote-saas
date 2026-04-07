import { createBrowserClient } from "@supabase/ssr";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowser() {
  if (!hasSupabasePublicEnv()) {
    throw new Error(
      "未配置 Supabase：请在项目根目录创建 .env.local，填写 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY 后重启 dev。",
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
