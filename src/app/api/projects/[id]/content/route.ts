import { NextRequest, NextResponse } from "next/server";
import { saveCells, type Cell } from "@/lib/storage";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({ cells: [] }));
    const cells: Cell[] = Array.isArray(body.cells)
      ? body.cells.map((c: Cell) => ({
          id: String(c.id ?? crypto.randomUUID()),
          type: c.type === "code" ? "code" : "markdown",
          content: typeof c.content === "string" ? c.content : "",
          ...(c.output ? { output: c.output } : {}),
        }))
      : [];
    await saveCells(id, cells);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
