import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/api";
import { makeDir } from "@/lib/storage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    await makeDir(id, str(body, "path"), str(body, "name"));
    return ok({ ok: true }, 201);
  });
}
