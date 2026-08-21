import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/api";
import { removeEntry } from "@/lib/storage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    await removeEntry(id, str(body, "path"));
    return ok({ ok: true });
  });
}
