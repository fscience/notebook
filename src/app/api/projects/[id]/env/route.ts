import { NextRequest, NextResponse } from "next/server";
import { envStatus } from "@/lib/env";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const status = await envStatus(id);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
