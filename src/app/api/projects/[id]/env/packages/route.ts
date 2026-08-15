import { NextRequest, NextResponse } from "next/server";
import { listPackages, type PackageInfo } from "@/lib/env";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const packages: PackageInfo[] = await listPackages(id);
    return NextResponse.json({ packages });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
