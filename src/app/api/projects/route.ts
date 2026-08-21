import { handle, ok, readJson } from "@/lib/api";
import { listProjects, createProject } from "@/lib/storage";

export async function GET() {
  return handle(async () => ok(await listProjects()));
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    return ok(
      await createProject(typeof body.name === "string" ? body.name : ""),
      201
    );
  });
}
