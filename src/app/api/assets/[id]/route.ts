import { readAssetBuffer } from "@/lib/records";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await readAssetBuffer(id);
  if (!result) {
    return new Response("Not Found", { status: 404 });
  }

  if (result.content.kind === "redirect") {
    return Response.redirect(result.content.url, 302);
  }

  return new Response(result.content.buffer, {
    headers: {
      "Content-Type": result.asset.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(
        result.asset.originalName,
      )}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
