import { readAssetBuffer, readAssetThumbnail } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";
  const thumb = url.searchParams.get("thumb") === "1";

  if (thumb) {
    const result = await readAssetThumbnail(id);
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

  const result = await readAssetBuffer(id, { download: forceDownload });
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
}
