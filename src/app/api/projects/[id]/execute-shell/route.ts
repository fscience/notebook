import { NextRequest, NextResponse } from "next/server";
import { projectFilesDir } from "@/lib/storage";
import { runShell, type ShellResult } from "@/lib/runShell";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const commands = typeof body.commands === "string" ? body.commands : "";
    const result: ShellResult = await runShell(commands, {
      cwd: await projectFilesDir(id),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
