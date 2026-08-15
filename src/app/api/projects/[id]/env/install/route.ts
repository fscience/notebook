import { NextRequest, NextResponse } from "next/server";
import { installPackages } from "@/lib/env";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const packages = body.packages;
    const res = await installPackages(id, packages);
    if (res.error) {
      return NextResponse.json(
        { error: `无法启动 uv: ${res.error}` },
        { status: 500 }
      );
    }
    if ((res.code ?? 1) !== 0) {
      return NextResponse.json(
        {
          error:
            res.stderr.trim() ||
            (res.timedOut ? "安装超时" : "安装失败"),
          output: res.stdout,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, output: res.stdout + res.stderr });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
