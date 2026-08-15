import Prism from "prismjs";
import "prismjs/components/prism-python";

export function highlightPython(code: string): string {
  if (!code) return "";
  try {
    return Prism.highlight(code, Prism.languages.python, "python");
  } catch {
    return escapeHtml(code);
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
