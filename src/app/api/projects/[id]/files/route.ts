import { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api";
import { listFiles, saveUploadedFile } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const relPath = request.nextUrl.searchParams.get("path") ?? "";
    return ok({ path: relPath, entries: await listFiles(id, relPath) });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const form = await request.formData();
    const relPath = String(form.get("path") ?? "");
    const files = form.getAll("files").filter(
      (f): f is File => f instanceof File
    );
    if (files.length === 0) {
      return fail("没有上传任何文件", 400);
    }
    const saved: string[] = [];
    const relpaths = form.getAll("relpath").map(String);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sub = relpaths[i] ?? "";
      await saveUploadedFile(
        id,
        relPath,
        sub,
        file.name,
        Buffer.from(await file.arrayBuffer())
      );
      saved.push(sub ? `${sub}/${file.name}` : file.name);
    }
    return ok({ ok: true, saved }, 201);
  });
}
