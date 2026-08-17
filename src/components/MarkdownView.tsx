"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkDocLinks, docNameFromHref } from "@/lib/wiki";
import { highlightPython, highlightShell } from "@/lib/highlight";

interface Props {
  content: string;
  onNavigate: (docName: string) => void;
}

export default function MarkdownView({ content, onNavigate }: Props) {
  const clean = content
    .replace(/\u200B/g, "")
    .replace(/^(>.*?)\n(?=>)/gm, "$1  \n");

  if (!clean.trim()) {
    return <p className="text-muted italic">双击页面 Markdown 开始编写内容...</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDocLinks]}
        components={{
          code({ className, children, ...props }) {
            const lang = /language-([\w-]+)/.exec(className || "")?.[1];
            const codeStr = String(children ?? "").replace(/\n$/, "");
            if (lang === "python" || lang === "py") {
              return (
                <code
                  className={className}
                  dangerouslySetInnerHTML={{ __html: highlightPython(codeStr) }}
                  {...props}
                />
              );
            }
            if (lang === "bash" || lang === "shell" || lang === "sh") {
              return (
                <code
                  className={className}
                  dangerouslySetInnerHTML={{ __html: highlightShell(codeStr) }}
                  {...props}
                />
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            const doc =
              typeof href === "string" ? docNameFromHref(href) : null;
            if (doc != null) {
              return (
                <a
                  href={href}
                  title={`打开文档：${doc}`}
                  className="wiki-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(doc);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {clean}
      </ReactMarkdown>
    </div>
  );
}
