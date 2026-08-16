import { NextRequest, NextResponse } from "next/server";
import { saveDocument, type CellOutput } from "@/lib/storage";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const content = typeof body.content === "string" ? body.content : "";
    const outputs: Record<string, CellOutput> = {};
    if (body.outputs && typeof body.outputs === "object") {
      for (const [key, value] of Object.entries(body.outputs)) {
        if (value && typeof value === "object") {
          outputs[key] = value as CellOutput;
        }
      }
    }
    const documents = await saveDocument(id, name, content, outputs);
    return NextResponse.json({ ok: true, documents });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
