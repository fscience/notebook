import { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api";
import {
  getProject,
  getDocuments,
  deleteProject,
  renameProject,
} from "@/lib/storage";
import { disposeProjectShellSessions } from "@/lib/shell";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const project = await getProject(id);
    return ok({ ...project, documents: await getDocuments(id) });
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(request);
    return ok(await renameProject(id, typeof body.name === "string" ? body.name : ""));
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    await deleteProject(id);
    disposeProjectShellSessions(id);
    return ok({ ok: true });
  });
}
