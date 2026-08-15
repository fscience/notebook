"use client";

import { useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { Plus, Trash, Edit } from "@/components/icons";

interface Props {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  loading: boolean;
}

export default function ProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  loading,
}: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const cancelRenameRef = useRef(false);

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

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditName(current);
  }

  async function finishRename() {
    if (editingId == null) return;
    const id = editingId;
    setEditingId(null);
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    const clean = editName.trim();
    if (!clean || clean === projects.find((p) => p.id === id)?.name) return;
    await onRename(id, clean);
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
              title="双击重命名"
            >
              {editingId === p.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") void finishRename();
                    else if (e.key === "Escape") {
                      cancelRenameRef.current = true;
                      setEditingId(null);
                    }
                  }}
                  onBlur={() => void finishRename()}
                  className="min-w-0 flex-1 rounded border border-accent bg-input px-1.5 py-0.5 text-sm outline-none"
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  title={p.name}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(p.id, p.name);
                  }}
                >
                  {p.name}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(p.id, p.name);
                }}
                className="ml-1 rounded p-1 text-muted hover:bg-accent/15 hover:text-accent"
                title="重命名"
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
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
