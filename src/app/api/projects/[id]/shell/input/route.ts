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
  const data = typeof body.data === "string" ? body.data : "";
  if (!data) {
    return NextResponse.json({ error: "缺少输入内容" }, { status: 400 });
  }
  const session = getSession(id, cellId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  session.write(data);
  return NextResponse.json({ ok: true });
}
