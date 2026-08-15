import { NextRequest, NextResponse } from "next/server";
import { listFiles, saveUploadedFile } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const relPath = request.nextUrl.searchParams.get("path") ?? "";
    const entries = await listFiles(id, relPath);
    return NextResponse.json({ path: relPath, entries });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const relPath = String(form.get("path") ?? "");
    const files = form.getAll("files").filter(
      (f): f is File => f instanceof File
    );
    if (files.length === 0) {
      return NextResponse.json({ error: "没有上传任何文件" }, { status: 400 });
    }
    const saved: string[] = [];
    const relpaths = form.getAll("relpath").map(String);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sub = relpaths[i] ?? "";
      const buf = Buffer.from(await file.arrayBuffer());
      await saveUploadedFile(id, relPath, sub, file.name, buf);
      saved.push(sub ? `${sub}/${file.name}` : file.name);
    }
    return NextResponse.json({ ok: true, saved }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
