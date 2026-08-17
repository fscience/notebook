"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  TerminalIcon,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  ListBullet,
  ListOrdered,
  Code,
  Minus,
  Text,
} from "@/components/icons";

export type SlashCommandKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bullet-list"
  | "ordered-list"
  | "fenced-code"
  | "thematic-break"
  | "python-run"
  | "shell-run";

interface SlashItem {
  id: SlashCommandKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "text" | "run";
}

const SLASH_ITEMS: SlashItem[] = [
  { id: "paragraph", label: "正文", description: "普通段落文本", icon: <Text className="h-4 w-4" />, category: "text" },
  { id: "h1", label: "标题 1", description: "一级标题", icon: <Heading1 className="h-4 w-4" />, category: "text" },
  { id: "h2", label: "标题 2", description: "二级标题", icon: <Heading2 className="h-4 w-4" />, category: "text" },
  { id: "h3", label: "标题 3", description: "三级标题", icon: <Heading3 className="h-4 w-4" />, category: "text" },
  { id: "quote", label: "引用", description: "引用块", icon: <Quote className="h-4 w-4" />, category: "text" },
  { id: "bullet-list", label: "无序列表", description: "项目符号列表", icon: <ListBullet className="h-4 w-4" />, category: "text" },
  { id: "ordered-list", label: "有序列表", description: "编号列表", icon: <ListOrdered className="h-4 w-4" />, category: "text" },
  { id: "fenced-code", label: "代码块", description: "围栏代码块", icon: <Code className="h-4 w-4" />, category: "text" },
  { id: "thematic-break", label: "分割线", description: "水平分割线", icon: <Minus className="h-4 w-4" />, category: "text" },
  { id: "python-run", label: "Python 运行块", description: "插入可运行的 Python 代码", icon: <Play className="h-4 w-4" />, category: "run" },
  { id: "shell-run", label: "Shell 运行块", description: "插入可运行的 Shell 命令", icon: <TerminalIcon className="h-4 w-4" />, category: "run" },
];

interface Props {
  open: boolean;
  query: string;
  onSelect: (kind: SlashCommandKind) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function SlashMenu({ open, query, onSelect, onClose, position }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return SLASH_ITEMS;
    const q = query.toLowerCase();
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length > 0) {
          const idx = Math.min(activeIndex, filtered.length - 1);
          onSelect(filtered[idx].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, filtered, activeIndex, onSelect, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      className="slash-menu"
      style={{ top: position.top, left: position.left }}
    >
      <div ref={listRef} className="slash-menu-list">
        {filtered.map((item, i) => (
          <button
            key={item.id}
            className={`slash-menu-item ${i === activeIndex ? "active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item.id);
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <span className="slash-menu-icon">{item.icon}</span>
            <span className="slash-menu-text">
              <span className="slash-menu-label">{item.label}</span>
              <span className="slash-menu-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
