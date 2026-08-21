import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
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
  return handle(async () => {
    const { id } = await params;
    const cell = request.nextUrl.searchParams.get("cell") ?? "";
    const [commands, cwd, root] = await Promise.all([
      getShellHistory(id, cell),
      getShellCwd(id, cell),
      projectFilesDir(id),
    ]);
    return ok({ commands, cwd, root });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const cell = request.nextUrl.searchParams.get("cell") ?? "";
    await clearShellHistory(id, cell);
    return ok({ ok: true });
  });
}
