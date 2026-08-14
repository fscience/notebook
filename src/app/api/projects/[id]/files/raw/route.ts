import { NextRequest } from "next/server";
import { fileMeta } from "@/lib/storage";
import fs from "node:fs";
import path from "node:path";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".markdown": "text/plain; charset=utf-8",
  ".json": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".tsv": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".js": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".jsx": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
  ".html": "text/plain; charset=utf-8",
  ".htm": "text/plain; charset=utf-8",
  ".css": "text/plain; charset=utf-8",
  ".scss": "text/plain; charset=utf-8",
  ".xml": "text/plain; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".yml": "text/plain; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".ini": "text/plain; charset=utf-8",
  ".sql": "text/plain; charset=utf-8",
  ".sh": "text/plain; charset=utf-8",
  ".bash": "text/plain; charset=utf-8",
  ".ipynb": "text/plain; charset=utf-8",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const relPath = request.nextUrl.searchParams.get("path") ?? "";
    const { target, size } = await fileMeta(id, relPath);
    const ext = path.extname(target).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const stream = fs.createReadStream(target);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
}
