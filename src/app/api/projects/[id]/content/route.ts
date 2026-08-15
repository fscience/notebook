import { NextRequest, NextResponse } from "next/server";
import { saveDocument, type Cell } from "@/lib/storage";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const cells: Cell[] = Array.isArray(body.cells)
      ? body.cells.map((c: Cell) => ({
          id: String(c.id ?? crypto.randomUUID()),
          type:
            c.type === "code" ? "code" : c.type === "shell" ? "shell" : "markdown",
          content: typeof c.content === "string" ? c.content : "",
          ...(c.output ? { output: c.output } : {}),
        }))
      : [];
    const documents = await saveDocument(id, name, cells);
    return NextResponse.json({ ok: true, documents });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
