"use client";

import { GripVertical } from "@/components/icons";

interface Props {
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  visible: boolean;
}

export default function DragHandle({ onDragStart, onDragEnd, visible }: Props) {
  return (
    <div
      className={`drag-handle ${visible ? "visible" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="h-4 w-4" />
    </div>
  );
}
