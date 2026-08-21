import { NextRequest } from "next/server";
import { fail, ok, readJson, str } from "@/lib/api";
import { getSession } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await readJson(request);
  const cols = Number(body.cols);
  const rows = Number(body.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return fail("无效的终端尺寸", 400);
  }
  const session = getSession(id, str(body, "cellId"));
  if (!session) return fail("会话不存在", 404);
  session.resize(cols, rows);
  return ok({ ok: true });
}
