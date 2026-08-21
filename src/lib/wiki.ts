export const ROOT_DOC_NAME = "首页";

const WIKI_LINK_RE = /!\[\[([^\]]+)\]\]/g;

export function extractDocLinks(markdown: string): string[] {
  const names: string[] = [];
  for (const m of markdown.matchAll(WIKI_LINK_RE)) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}
