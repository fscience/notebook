import { NextRequest, NextResponse } from "next/server";
import { projectFilesDir } from "@/lib/storage";
import { runPython, type PythonResult } from "@/lib/python";
import { ensureEnv } from "@/lib/env";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const codeCells: unknown[] = Array.isArray(body.codeCells)
      ? body.codeCells
      : [];
    const allCode = codeCells
      .filter((c): c is string => typeof c === "string")
      .join("\n\n");

    const pythonPath = await ensureEnv(id);
    const result: PythonResult = await runPython(allCode, {
      cwd: projectFilesDir(id),
      pythonPath,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
