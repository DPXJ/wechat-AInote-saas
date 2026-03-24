import { NextResponse } from "next/server";
import { deleteAssetForUser, mapAsset, readAssetBuffer, readAssetThumbnail, updateAssetMetadata } from "@/lib/records";
import { requireUserId } from "@/lib/supabase/server";

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
        // 代理回源：客户端 fetch 同源 200+body 才能写入 Cache API，避免 302 后跨源 opaque 无法缓存
        const proxyRes = await fetch(result.content.url, { cache: "force-cache" });
        if (!proxyRes.ok) {
          return Response.redirect(result.content.url, 302);
        }
        const buffer = await proxyRes.arrayBuffer();
        return new Response(buffer, {
          headers: {
            "Content-Type": result.asset.mimeType,
            "Cache-Control": "public, max-age=86400",
          },
        });
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
      // 原图也走代理：避免前端 fetch 跟随 302 跨源拿不到 body，导致预览/全屏显示失败
      const proxyRes = await fetch(result.content.url, { cache: "force-cache" });
      if (!proxyRes.ok) {
        return Response.redirect(result.content.url, 302);
      }
      const buffer = await proxyRes.arrayBuffer();
      const disposition = forceDownload ? "attachment" : "inline";
      return new Response(buffer, {
        headers: {
          "Content-Type": result.asset.mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(
            result.asset.originalName,
          )}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = (await request.json()) as { description?: string; tags?: string[] };
    const row = await updateAssetMetadata(userId, id, {
      description: body.description,
      tags: body.tags,
    });
    if (!row) {
      return NextResponse.json({ error: "附件不存在。" }, { status: 404 });
    }
    return NextResponse.json({ asset: mapAsset(row) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await deleteAssetForUser(userId, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ record: result.record }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
