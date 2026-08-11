import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Can be ignored if called from a Server Component
          }
        },
      },
    },
  );
}

export async function getCurrentUserId(): Promise<string | null> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  const bearerUserId = await getUserIdFromAuthorization(authorization);
  if (bearerUserId) return bearerUserId;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getUserIdFromAuthorization(authorization: string | null): Promise<string | null> {
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearerToken) {
    const {
      data: { user },
      error,
    } = await getSupabaseAdmin().auth.getUser(bearerToken);
    if (!error && user?.id) return user.id;
  }
  return null;
}

export async function getCurrentUserIdFromRequest(request: Request): Promise<string | null> {
  const bearerUserId = await getUserIdFromAuthorization(request.headers.get("authorization"));
  if (bearerUserId) return bearerUserId;
  return getCurrentUserId();
}

export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function requireUserIdFromRequest(request: Request): Promise<string> {
  const userId = await getCurrentUserIdFromRequest(request);
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
