import { NextRequest, NextResponse } from "next/server";
import { mutatePackages } from "./env";

type RouteCtx = { params: Promise<{ id: string }> };

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(error: string, status = 500): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Wraps a route handler body with uniform error handling. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function readJson(
  request: Request
): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({}));
}

export function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v : "";
}

/**
 * Builds the shared POST handler for the env package install/uninstall
 * routes, which differ only in the uv subcommand and error wording.
 */
export function packageAction(action: "install" | "uninstall") {
  const label = action === "install" ? "安装" : "卸载";
  return (request: NextRequest, ctx: RouteCtx): Promise<Response> =>
    handle(async () => {
      const { id } = await ctx.params;
      const body = await readJson(request);
      const res = await mutatePackages(id, body.packages, action);
      if (res.error) return fail(`无法启动 uv: ${res.error}`);
      if ((res.code ?? 1) !== 0) {
        return NextResponse.json(
          {
            error:
              res.stderr.trim() ||
              (res.timedOut ? `${label}超时` : `${label}失败`),
            output: res.stdout,
          },
          { status: 500 }
        );
      }
      return ok({ ok: true, output: res.stdout + res.stderr });
    });
}
