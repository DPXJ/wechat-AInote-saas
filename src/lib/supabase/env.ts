/** 浏览器与 Edge 中间件共用：判断是否已配置 Supabase 公钥（NEXT_PUBLIC_*） */
export function hasSupabasePublicEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}
