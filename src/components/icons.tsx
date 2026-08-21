import type { ReactNode } from "react";

function Icon({
  viewBox,
  className = "",
  children,
}: {
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox={viewBox} fill="currentColor" className={className}>
      {children}
    </svg>
  );
}

function Icon16({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Icon viewBox="0 0 16 16" className={className}>
      {children}
    </Icon>
  );
}

type P = { className?: string };

export function ChevronDown({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M3.3 5.7a1 1 0 0 1 1.4 0L8 9.6l3.3-3.9a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
    </Icon16>
  );
}

export function ChevronUp({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M3.3 10.3a1 1 0 0 1 1.4 0L8 6.4l3.3 3.9a1 1 0 0 1 1.4-1.4l-4-4a1 1 0 0 1-1.4 0l-4 4a1 1 0 0 1 0 1.4Z" />
    </Icon16>
  );
}

export function ChevronLeft({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M10.3 3.3a1 1 0 0 1 0 1.4L7.4 8l2.9 3.3a1 1 0 0 1-1.4 1.4l-3.6-4a1 1 0 0 1 0-1.4l3.6-4a1 1 0 0 1 1.4 0Z" />
    </Icon16>
  );
}

export function ChevronRight({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M5.7 12.7a1 1 0 0 1 0-1.4L8.6 8 5.7 4.7a1 1 0 0 1 1.4-1.4l3.6 4a1 1 0 0 1 0 1.4l-3.6 4a1 1 0 0 1-1.4 0Z" />
    </Icon16>
  );
}

export function Folder({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.5a1.5 1.5 0 0 1 1.1.5l.9 1H13A1.5 1.5 0 0 1 14.5 4.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8.5Z" />
    </Icon16>
  );
}

export function FileIcon({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M4 1h5.5L13 4.5V13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V2.5A1.5 1.5 0 0 1 4.5 1H4Z" />
    </Icon16>
  );
}

export function Plus({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M8 2.5a1 1 0 0 1 1 1V7h3.5a1 1 0 1 1 0 2H9v3.5a1 1 0 1 1-2 0V9H3.5a1 1 0 1 1 0-2H7V3.5a1 1 0 0 1 1-1Z" />
    </Icon16>
  );
}

export function Trash({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M6 1.5h4a1.5 1.5 0 0 1 1.5 1.5v.5h2.25a.75.75 0 0 1 0 1.5h-.31l-.6 9.06A1.5 1.5 0 0 1 11.35 16H4.65a1.5 1.5 0 0 1-1.49-1.44l-.6-9.06h-.31a.75.75 0 0 1 0-1.5H4.5V3A1.5 1.5 0 0 1 6 1.5Zm.75 3.25h2.5V3.25h-2.5v1.5ZM6 6.5a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5A.75.75 0 0 0 6 6.5Zm4 0a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5A.75.75 0 0 0 10 6.5Z" />
    </Icon16>
  );
}

export function Upload({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M7.25 9.5a.75.75 0 0 0 1.5 0V3.31l2.22 2.22a.75.75 0 1 0 1.06-1.06L8.53 1.22a.75.75 0 0 0-1.06 0L3.97 4.47a.75.75 0 1 0 1.06 1.06l2.22-2.22V9.5Z" />
      <path d="M2.5 10.75a.75.75 0 0 1 1.5 0V13.5h8v-2.75a.75.75 0 0 1 1.5 0V14a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2.5 14v-3.25Z" />
    </Icon16>
  );
}

export function NewFolder({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.5a1.5 1.5 0 0 1 1.1.5l.9 1H13A1.5 1.5 0 0 1 14.5 4.5v3a.75.75 0 0 1-1.5 0v-3H5.86l-1-1H3v8.5h5.5a.75.75 0 0 1 0 1.5H3A1.5 1.5 0 0 1 1.5 12V3Z" />
      <path d="M10.5 7.5a.75.75 0 0 1 .75.75V10h1.75a.75.75 0 0 1 0 1.5h-1.75v1.75a.75.75 0 0 1-1.5 0V11.5H8a.75.75 0 0 1 0-1.5h1.75V8.25a.75.75 0 0 1 .75-.75Z" />
    </Icon16>
  );
}

export function Refresh({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89.75.75 0 0 1 1.06-1.06A7 7 0 1 0 15 8a.75.75 0 0 1-1.5 0Zm-1.06-4.39-.44 2.14a.75.75 0 0 1-.92.56l-2.14-.44a.75.75 0 0 1 .31-1.47l1 .2A5.98 5.98 0 0 0 2.5 8a5.5 5.5 0 1 0 9.94-4.39Z" />
    </Icon16>
  );
}

export function Close({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M4.22 3.16a.75.75 0 0 0-1.06 1.06L6.94 8l-3.78 3.78a.75.75 0 1 0 1.06 1.06L8 9.06l3.78 3.78a.75.75 0 1 0 1.06-1.06L9.06 8l3.78-3.78a.75.75 0 0 0-1.06-1.06L8 6.94 4.22 3.16Z" />
    </Icon16>
  );
}

export function Play({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M5 2.75a.75.75 0 0 1 1.13-.65l7.5 4.75a.75.75 0 0 1 0 1.3l-7.5 4.75a.75.75 0 0 1-1.13-.65V2.75Z" />
    </Icon16>
  );
}

export function Edit({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M11.3 1.3a1.84 1.84 0 0 1 2.6 0l.8.8a1.84 1.84 0 0 1 0 2.6L6.2 13.2a1.5 1.5 0 0 1-.63.36l-3.87.9a.75.75 0 0 1-.9-.9l.9-3.87a1.5 1.5 0 0 1 .36-.63l8.24-8.16ZM12.5 2.2 4.7 10.05l-.8 2.05 2.05-.8L13.8 3.5l-1.3-1.3Z" />
    </Icon16>
  );
}

export function Gear({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M6.75.25a1 1 0 0 1 2.5 0l.28.9a6.02 6.02 0 0 1 2.16 1.25l.94-.14a1 1 0 0 1 1.06 1.06l-.14.94c.87.6 1.6 1.39 2.1 2.31l.9.28a1 1 0 0 1 0 2.5l-.9.28a6 6 0 0 1-2.1 2.31l.14.94a1 1 0 0 1-1.06 1.06l-.94-.14a6.02 6.02 0 0 1-2.16 1.25l-.28.9a1 1 0 0 1-2.5 0l-.28-.9a6.02 6.02 0 0 1-2.16-1.25l-.94.14a1 1 0 0 1-1.06-1.06l.14-.94a6.02 6.02 0 0 1-2.1-2.31l-.9-.28a1 1 0 0 1 0-2.5l.9-.28a6.02 6.02 0 0 1 2.1-2.31l-.14-.94a1 1 0 0 1 1.06-1.06l.94.14A6.02 6.02 0 0 1 6.47 1.15l.28-.9ZM8 5.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z" />
    </Icon16>
  );
}

export function TerminalIcon({ className }: P) {
  return (
    <Icon16 className={className}>
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11Zm2.62 1.38a.75.75 0 0 0-1.24 1.24l1.5 1.5a.75.75 0 0 0 0 1.06l-1.5 1.5a.75.75 0 0 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2Zm4.38.87a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5H9Z" />
    </Icon16>
  );
}
