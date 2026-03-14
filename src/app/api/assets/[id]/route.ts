import { requireUserId } from "@/lib/supabase/server";
import { readAssetBuffer, readAssetThumbnail } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const url = new URL(request.url);
    const forceDownload = url.searchParams.get("download") === "1";
    const thumb = url.searchParams.get("thumb") === "1";

    if (thumb) {
      const result = await readAssetThumbnail(userId, id);
      if (!result) {
        return new Response("Not Found", { status: 404 });
      }
      if (result.content.kind === "redirect") {
        return Response.redirect(result.content.url, 302);
      }
      return new Response(result.content.buffer, {
        headers: {
          "Content-Type": result.asset.mimeType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const result = await readAssetBuffer(userId, id, { download: forceDownload });
    if (!result) {
      return new Response("Not Found", { status: 404 });
    }

    if (result.content.kind === "redirect") {
      return Response.redirect(result.content.url, 302);
    }

    const disposition = forceDownload ? "attachment" : "inline";

    return new Response(result.content.buffer, {
      headers: {
        "Content-Type": result.asset.mimeType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
          result.asset.originalName,
        )}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "未登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }
}
