import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { listPackages } from "@/lib/env";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    return ok({ packages: await listPackages(id) });
  });
}
