import { NextRequest } from "next/server";
import {
  attachShell,
  currentStream,
  getLiveCommands,
  setStream,
} from "@/lib/shell";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cellId = request.nextUrl.searchParams.get("cell") ?? "";
  const encoder = new TextEncoder();
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  let session;
  try {
    session = await attachShell(id, cellId);
  } catch (err) {
    const msg = (err as Error).message;
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", text: msg })}\n\n`)
        );
        controller.close();
      },
    });
    return new Response(errorStream, { headers });
  }

  const buffer: Uint8Array[] = [];
  let waiting: (() => void) | null = null;
  let ended = false;
  let closed = false;

  function wake() {
    if (!waiting) return;
    const w = waiting;
    waiting = null;
    w();
  }

  function push(obj: unknown) {
    if (closed || ended) return;
    buffer.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    wake();
  }

  function finish() {
    if (ended) return;
    ended = true;
    wake();
  }

  const myStream = setStream(id, cellId, {
    onData: (text) => push({ type: "stdout", text }),
    onExit: () => {
      push({ type: "exit" });
      finish();
    },
    onCommands: (commands) => push({ type: "commands", commands }),
  });

  push({ type: "cwd", cwd: session.cwd, root: session.root });
  push({ type: "commands", commands: getLiveCommands(id, cellId) });

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (closed) {
        controller.close();
        return;
      }
      if (buffer.length > 0) {
        controller.enqueue(buffer.shift()!);
        return;
      }
      if (ended) {
        controller.close();
        return;
      }
      return new Promise<void>((resolve) => {
        waiting = resolve;
      }).then(() => {
        if (closed) {
          controller.close();
          return;
        }
        if (buffer.length > 0) {
          controller.enqueue(buffer.shift()!);
        } else if (ended) {
          controller.close();
        }
      });
    },
    cancel() {
      closed = true;
      if (currentStream(id, cellId) === myStream) session.kill();
      wake();
    },
  });

  return new Response(stream, { headers });
}
