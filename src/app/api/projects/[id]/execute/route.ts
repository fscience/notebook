import { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api";
import { projectFilesDir } from "@/lib/storage";
import { runPython } from "@/lib/python";
import { ensureEnv } from "@/lib/env";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    const allCode = (Array.isArray(body.codeCells) ? body.codeCells : [])
      .filter((c): c is string => typeof c === "string")
      .join("\n\n");

    const pythonPath = await ensureEnv(id);
    return ok(
      await runPython(allCode, {
        cwd: await projectFilesDir(id),
        pythonPath,
      })
    );
  });
}
