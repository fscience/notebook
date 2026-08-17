"use client";

import { useEffect, useRef } from "react";
import {
  ArrowsUpDown,
  Copy,
  Trash,
  Play,
  TerminalIcon,
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  ListBullet,
  ListOrdered,
} from "@/components/icons";

export type ContextMenuAction =
  | "move-up"
  | "move-down"
  | "duplicate"
  | "delete"
  | "insert-python"
  | "insert-shell"
  | "copy-markdown"
  | "convert-paragraph"
  | "convert-h1"
  | "convert-h2"
  | "convert-h3"
  | "convert-quote"
  | "convert-bullet-list"
  | "convert-ordered-list"
  | "convert-code"
  | "format-bold"
  | "format-italic"
  | "format-code"
  | "__close__";

interface MenuItem {
  id: ContextMenuAction | string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  open: boolean;
  position: { x: number; y: number };
  isMarkdown: boolean;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}

export default function BlockContextMenu({ open, position, isMarkdown, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const markdownItems: MenuItem[] = [
    { id: "format-bold", label: "粗体", icon: <Bold className="h-3.5 w-3.5" /> },
    { id: "format-italic", label: "斜体", icon: <Italic className="h-3.5 w-3.5" /> },
    { id: "format-code", label: "行内代码", icon: <Code className="h-3.5 w-3.5" /> },
    { id: "divider-1", label: "", icon: null, divider: true },
    { id: "convert-paragraph", label: "转为正文", icon: <span className="text-xs font-bold">P</span> },
    { id: "convert-h1", label: "转为标题 1", icon: <Heading1 className="h-3.5 w-3.5" /> },
    { id: "convert-h2", label: "转为标题 2", icon: <Heading2 className="h-3.5 w-3.5" /> },
    { id: "convert-h3", label: "转为标题 3", icon: <Heading3 className="h-3.5 w-3.5" /> },
    { id: "convert-quote", label: "转为引用", icon: <Quote className="h-3.5 w-3.5" /> },
    { id: "convert-bullet-list", label: "转为无序列表", icon: <ListBullet className="h-3.5 w-3.5" /> },
    { id: "convert-ordered-list", label: "转为有序列表", icon: <ListOrdered className="h-3.5 w-3.5" /> },
    { id: "convert-code", label: "转为代码块", icon: <Code className="h-3.5 w-3.5" /> },
  ];

  const commonItems: MenuItem[] = [
    { id: "divider-2", label: "", icon: null, divider: true },
    { id: "insert-python", label: "下方插入 Python 块", icon: <Play className="h-3.5 w-3.5" /> },
    { id: "insert-shell", label: "下方插入 Shell 块", icon: <TerminalIcon className="h-3.5 w-3.5" /> },
    { id: "divider-3", label: "", icon: null, divider: true },
    { id: "move-up", label: "上移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
    { id: "move-down", label: "下移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
    { id: "duplicate", label: "复制块", icon: <Copy className="h-3.5 w-3.5" /> },
    { id: "copy-markdown", label: "复制为 Markdown", icon: <Copy className="h-3.5 w-3.5" /> },
    { id: "divider-4", label: "", icon: null, divider: true },
    { id: "delete", label: "删除", icon: <Trash className="h-3.5 w-3.5" />, danger: true },
  ];

  const items = isMarkdown ? [...markdownItems, ...commonItems] : commonItems;

  const adjustedTop = Math.min(position.y, window.innerHeight - items.length * 36 - 20);
  const adjustedLeft = Math.min(position.x, window.innerWidth - 220);

  return (
    <div
      ref={ref}
      className="block-context-menu"
      style={{ top: adjustedTop, left: adjustedLeft }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="context-menu-divider" />;
        }
        return (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              onAction(item.id as ContextMenuAction);
              onClose();
            }}
          >
            <span className="context-menu-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
