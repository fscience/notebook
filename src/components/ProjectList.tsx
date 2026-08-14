"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { Plus, Trash } from "@/components/icons";

interface Props {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}

export default function ProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  loading,
}: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name);
      setName("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirmId === id) {
      await onDelete(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={handleCreate} className="flex gap-1 border-b border-panel-border p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新项目名称"
          className="min-w-0 flex-1 rounded border border-panel-border bg-input px-2 py-1 text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-40"
          title="创建项目"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>

      <div className="flex-1 overflow-y-auto p-1.5">
        {loading && projects.length === 0 ? (
          <p className="p-2 text-xs text-muted">加载中...</p>
        ) : projects.length === 0 ? (
          <p className="p-2 text-xs text-muted">还没有项目，请在上面创建。</p>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className={`group mb-0.5 flex items-center rounded px-2 py-1.5 text-sm cursor-pointer ${
                p.id === selectedId
                  ? "bg-accent/15 text-foreground"
                  : "text-foreground hover:bg-hover"
              }`}
              onClick={() => onSelect(p.id)}
            >
              <span className="min-w-0 flex-1 truncate" title={p.name}>
                {p.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(p.id);
                }}
                className={`ml-1 rounded p-1 ${
                  confirmId === p.id
                    ? "bg-danger text-white"
                    : "text-muted opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                }`}
                title={confirmId === p.id ? "再次点击确认删除" : "删除项目"}
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
