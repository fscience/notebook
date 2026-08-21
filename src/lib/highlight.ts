import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightCode(code: string, lang: "python" | "bash"): string {
  if (!code) return "";
  try {
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch {
    return escapeHtml(code);
  }
}
