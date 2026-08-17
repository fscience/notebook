"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  ListBullet,
  ListOrdered,
  ArrowsUpDown,
  Copy,
  Trash,
  Play,
  TerminalIcon,
} from "@/components/icons";
import type { MdBlockType } from "@/lib/mdblocks";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  blockType: MdBlockType | "python" | "shell";
  headingLevel?: number;
  onFormat: (action: string) => void;
  onBlockAction: (action: string) => void;
  position: { top: number; left: number } | null;
}

function getToolbarItems(
  blockType: MdBlockType | "python" | "shell",
  headingLevel?: number
): { formatting: ToolbarAction[]; blockOps: ToolbarAction[] } {
  const formatting: ToolbarAction[] = [];
  const blockOps: ToolbarAction[] = [];

  if (blockType === "python" || blockType === "shell") {
    blockOps.push(
      { id: "move-up", label: "上移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
      { id: "move-down", label: "下移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
      { id: "duplicate", label: "复制", icon: <Copy className="h-3.5 w-3.5" /> },
      { id: "delete", label: "删除", icon: <Trash className="h-3.5 w-3.5" />, danger: true }
    );
    return { formatting, blockOps };
  }

  formatting.push(
    { id: "bold", label: "粗体", icon: <Bold className="h-3.5 w-3.5" /> },
    { id: "italic", label: "斜体", icon: <Italic className="h-3.5 w-3.5" /> },
    { id: "strikethrough", label: "删除线", icon: <Strikethrough className="h-3.5 w-3.5" /> },
    { id: "code", label: "行内代码", icon: <Code className="h-3.5 w-3.5" /> },
    { id: "link", label: "链接", icon: <Link className="h-3.5 w-3.5" /> },
    { id: "divider-1", label: "", icon: null, divider: true },
    { id: "heading-1", label: "标题 1", icon: <Heading1 className="h-3.5 w-3.5" />, active: blockType === "heading" && headingLevel === 1 },
    { id: "heading-2", label: "标题 2", icon: <Heading2 className="h-3.5 w-3.5" />, active: blockType === "heading" && headingLevel === 2 },
    { id: "heading-3", label: "标题 3", icon: <Heading3 className="h-3.5 w-3.5" />, active: blockType === "heading" && headingLevel === 3 },
    { id: "paragraph", label: "正文", icon: <span className="text-xs font-bold">P</span>, active: blockType === "paragraph" },
    { id: "divider-2", label: "", icon: null, divider: true },
    { id: "bullet-list", label: "无序列表", icon: <ListBullet className="h-3.5 w-3.5" />, active: blockType === "bullet-list" },
    { id: "ordered-list", label: "有序列表", icon: <ListOrdered className="h-3.5 w-3.5" />, active: blockType === "ordered-list" },
    { id: "blockquote", label: "引用", icon: <Quote className="h-3.5 w-3.5" />, active: blockType === "blockquote" }
  );

  blockOps.push(
    { id: "move-up", label: "上移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
    { id: "move-down", label: "下移", icon: <ArrowsUpDown className="h-3.5 w-3.5" /> },
    { id: "duplicate", label: "复制", icon: <Copy className="h-3.5 w-3.5" /> },
    { id: "insert-python", label: "插入 Python 块", icon: <Play className="h-3.5 w-3.5" /> },
    { id: "insert-shell", label: "插入 Shell 块", icon: <TerminalIcon className="h-3.5 w-3.5" /> },
    { id: "delete", label: "删除", icon: <Trash className="h-3.5 w-3.5" />, danger: true }
  );

  return { formatting, blockOps };
}

export default function BlockToolbar({ blockType, headingLevel, onFormat, onBlockAction, position }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<"format" | "block">("format");
  const { formatting, blockOps } = getToolbarItems(blockType, headingLevel);

  useEffect(() => {
    if (!position) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onBlockAction("__close__");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [position, onBlockAction]);

  if (!position) return null;

  const items = activeGroup === "format" ? formatting : blockOps;

  return (
    <div
      ref={ref}
      className="block-toolbar"
      style={{ top: position.top, left: position.left }}
    >
      <div className="block-toolbar-tabs">
        <button
          className={`block-toolbar-tab ${activeGroup === "format" ? "active" : ""}`}
          onClick={() => setActiveGroup("format")}
        >
          格式
        </button>
        <button
          className={`block-toolbar-tab ${activeGroup === "block" ? "active" : ""}`}
          onClick={() => setActiveGroup("block")}
        >
          块操作
        </button>
      </div>
      <div className="block-toolbar-items">
        {items.map((item) => {
          if (item.divider) {
            return <div key={item.id} className="block-toolbar-divider" />;
          }
          return (
            <button
              key={item.id}
              className={`block-toolbar-btn ${item.active ? "active" : ""} ${item.danger ? "danger" : ""}`}
              title={item.label}
              onClick={() => {
                if (activeGroup === "format") {
                  onFormat(item.id);
                } else {
                  onBlockAction(item.id);
                }
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
