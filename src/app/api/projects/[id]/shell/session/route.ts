import { NextRequest, NextResponse } from "next/server";
import { attachShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const cellId = typeof body.cellId === "string" ? body.cellId : "";
    const session = await attachShell(id, cellId);
    return NextResponse.json({ ok: true, cwd: session.cwd, root: session.root });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
