import { NextRequest, NextResponse } from "next/server";
import {
  clearShellHistory,
  getShellCwd,
  getShellHistory,
} from "@/lib/shell";
import { projectFilesDir } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cell = request.nextUrl.searchParams.get("cell") ?? "";
    const [commands, cwd, root] = await Promise.all([
      getShellHistory(id, cell),
      getShellCwd(id, cell),
      projectFilesDir(id),
    ]);
    return NextResponse.json({ commands, cwd, root });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cell = request.nextUrl.searchParams.get("cell") ?? "";
    await clearShellHistory(id, cell);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
