import path from "node:path";
import { NextRequest } from "next/server";
import { handle, fail, ok, readJson, str } from "@/lib/api";
import { getDataRoot, saveSettings } from "@/lib/storage";

export async function GET() {
  return handle(async () => ok({ dataRoot: await getDataRoot() }));
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const body = await readJson(request);
    const dataRoot = str(body, "dataRoot").trim();
    if (dataRoot && !path.isAbsolute(dataRoot)) {
      return fail("数据根目录必须是绝对路径", 400);
    }
    await saveSettings({ dataRoot });
    return ok({ dataRoot: await getDataRoot() });
  });
}
