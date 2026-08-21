"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Refresh, Trash } from "@/components/icons";

interface PackageInfo {
  name: string;
  version: string;
}

interface Props {
  projectId: string;
}

export default function EnvPanel({ projectId }: Props) {
  const [pythonVersion, setPythonVersion] = useState("");
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pkgRes, statusRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/env/packages`),
        fetch(`/api/projects/${projectId}/env`),
      ]);
      const pkgData = await pkgRes.json();
      const statusData = await statusRes.json();
      if (!pkgRes.ok) throw new Error(pkgData.error || "加载失败");
      setPackages(Array.isArray(pkgData.packages) ? pkgData.packages : []);
      setPythonVersion(statusData.pythonVersion ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function mutate(
    action: "install" | "uninstall",
    packages: string[],
    busyKey: string,
    failLabel: string
  ) {
    if (busy) return;
    setBusy(busyKey);
    setError(null);
    setOutput(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/env/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages }),
      });
      const data = await res.json();
      setOutput(data.output ?? "");
      if (!res.ok) setError(data.error || `${failLabel}失败`);
      await load();
      return res.ok;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    const names = input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    if (await mutate("install", names, "install", "安装")) setInput("");
  }

  async function uninstall(name: string) {
    if (busy) return;
    if (!window.confirm(`确定卸载 ${name}?`)) return;
    await mutate("uninstall", [name], `uninstall:${name}`, "卸载");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-panel-border px-2 py-1.5">
        <span className="text-xs font-semibold">环境</span>
        <div className="flex-1" />
        {pythonVersion && (
          <span className="text-[10px] text-muted">
            Python {pythonVersion}
          </span>
        )}
        <button
          onClick={() => void load()}
          className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
          title="刷新"
        >
          <Refresh className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="border-b border-panel-border p-2">
        <p className="mb-1 text-[11px] text-muted">
           使用 uv 为每个项目创建独立的 Python 环境，首次使用自动创建。
        </p>
        <div className="flex gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void install();
            }}
            placeholder="如: numpy pandas matplotlib"
            className="min-w-0 flex-1 rounded border border-panel-border bg-input px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button
            onClick={() => void install()}
            disabled={busy !== null || !input.trim()}
            className="flex shrink-0 items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50"
            title="安装到当前项目环境"
          >
            <Plus className="h-3 w-3" /> {busy === "install" ? "安装中..." : "安装"}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted">
          多个包用空格或逗号分隔，可带版本，如 numpy&gt;=1.26
        </p>
      </div>

      {error && (
        <div className="mx-2 mt-2 rounded border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
          {error}
        </div>
      )}
      {output && (
        <pre className="mx-2 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-panel-border bg-input p-2 font-mono text-[10px] leading-relaxed">
          {output}
        </pre>
      )}

      <div className="flex-1 overflow-y-auto p-1.5">
        {busy?.startsWith("uninstall:") && (
          <p className="p-2 text-xs text-muted">正在卸载...</p>
        )}
        {loading ? (
          <p className="p-2 text-xs text-muted">加载中...</p>
        ) : packages.length === 0 ? (
          <p className="p-2 text-xs text-muted">尚未安装任何包。</p>
        ) : (
          packages.map((p) => (
            <div
              key={p.name}
              className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-hover"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]" title={p.name}>
                {p.name}
              </span>
              <span className="shrink-0 text-[10px] text-muted">{p.version}</span>
              <button
                onClick={() => void uninstall(p.name)}
                disabled={busy !== null}
                className="shrink-0 rounded p-1 text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100 disabled:opacity-30"
                title="卸载"
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
