import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const cellId = typeof body.cellId === "string" ? body.cellId : "";
  const cols = Number(body.cols);
  const rows = Number(body.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return NextResponse.json({ error: "无效的终端尺寸" }, { status: 400 });
  }
  const session = getSession(id, cellId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  session.resize(cols, rows);
  return NextResponse.json({ ok: true });
}
