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
  const data = str(body, "data");
  if (!data) return fail("缺少输入内容", 400);
  const session = getSession(id, str(body, "cellId"));
  if (!session) return fail("会话不存在", 404);
  session.write(data);
  return ok({ ok: true });
}
