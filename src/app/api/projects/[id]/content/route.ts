import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/api";
import { saveDocument } from "@/lib/storage";
import type { CellOutput } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    const outputs: Record<string, CellOutput> = {};
    if (body.outputs && typeof body.outputs === "object") {
      for (const [key, value] of Object.entries(body.outputs)) {
        if (value && typeof value === "object") {
          outputs[key] = value as CellOutput;
        }
      }
    }
    return ok({
      ok: true,
      documents: await saveDocument(
        id,
        str(body, "name"),
        str(body, "content"),
        outputs
      ),
    });
  });
}
