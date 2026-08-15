"use client";

import { useEffect, useState } from "react";
import { Close } from "@/components/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SettingsModal({ open, onClose, onSaved }: Props) {
  const [dataRoot, setDataRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setError(null);
      setSaving(false);
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "读取设置失败");
        if (!cancelled) setDataRoot(data.dataRoot ?? "");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataRoot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存失败");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-panel-border bg-panel-bg p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">设置</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-hover hover:text-foreground"
            title="关闭"
          >
            <Close className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted">数据根目录位置</label>
        <input
          value={dataRoot}
          onChange={(e) => setDataRoot(e.target.value)}
          placeholder="/path/to/data"
          spellCheck={false}
          className="mb-2 w-full rounded border border-panel-border bg-input px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
        />
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          项目的文档、文件、Python 环境等全部数据将存储在该目录下，请使用绝对路径；留空并保存可恢复为默认位置。
        </p>

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDataRoot("")}
            className="rounded px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-foreground"
            title="恢复默认位置"
          >
            恢复默认
          </button>
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
