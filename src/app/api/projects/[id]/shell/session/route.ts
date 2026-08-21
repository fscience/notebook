import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/api";
import { attachShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    const session = await attachShell(id, str(body, "cellId"), {
      persistHistory: body.persistHistory !== false,
    });
    return ok({ ok: true, cwd: session.cwd, root: session.root });
  });
}
