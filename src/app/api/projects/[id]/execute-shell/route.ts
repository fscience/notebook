import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/api";
import { projectFilesDir } from "@/lib/storage";
import { runShell } from "@/lib/runShell";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    return ok(
      await runShell(str(body, "commands"), {
        cwd: await projectFilesDir(id),
      })
    );
  });
}
