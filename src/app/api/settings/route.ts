import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getDataRoot, saveSettings } from "@/lib/storage";

export async function GET() {
  try {
    const dataRoot = await getDataRoot();
    return NextResponse.json({ dataRoot });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = typeof body.dataRoot === "string" ? body.dataRoot : "";
    const dataRoot = raw.trim();
    if (dataRoot && !path.isAbsolute(dataRoot)) {
      return NextResponse.json(
        { error: "数据根目录必须是绝对路径" },
        { status: 400 }
      );
    }
    await saveSettings({ dataRoot });
    const saved = await getDataRoot();
    return NextResponse.json({ dataRoot: saved });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
