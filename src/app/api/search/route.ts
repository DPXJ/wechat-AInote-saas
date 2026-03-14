import { NextResponse } from "next/server";
import { searchKnowledge } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") || "";
  return NextResponse.json(await searchKnowledge(query));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.q || "";
    const history = body.history || [];
    return NextResponse.json(await searchKnowledge(query, history));
  } catch {
    return NextResponse.json(await searchKnowledge(""));
  }
}
