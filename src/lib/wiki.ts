import type { Root, Text, Parent, RootContent } from "mdast";

export const ROOT_DOC_NAME = "首页";
export const DOC_LINK_PREFIX = "#wiki/";
export const WIKI_LINK_RE = /!\[\[([^\]]+)\]\]/g;

export function extractDocLinks(markdown: string): string[] {
  const names: string[] = [];
  for (const m of markdown.matchAll(WIKI_LINK_RE)) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

export function docNameFromHref(href: string): string | null {
  if (!href.startsWith(DOC_LINK_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(DOC_LINK_PREFIX.length));
  } catch {
    return null;
  }
}

const SKIP_TYPES = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "footnoteReference",
]);

function splitDocLinks(value: string): RootContent[] {
  const out: RootContent[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKI_LINK_RE)) {
    if (m.index > last) {
      out.push({ type: "text", value: value.slice(last, m.index) });
    }
    const name = m[1].trim();
    if (name) {
      out.push({
        type: "link",
        url: DOC_LINK_PREFIX + encodeURIComponent(name),
        title: null,
        children: [{ type: "text", value: name }],
      });
    }
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) });
  }
  return out;
}

function replaceDocLinksInChildren(parent: Parent): void {
  let changed = false;
  const children: RootContent[] = [];
  for (const child of parent.children) {
    if (child.type === "text") {
      const parts = splitDocLinks((child as Text).value);
      if (parts.length > 1) {
        changed = true;
        children.push(...parts);
      } else {
        children.push(child);
      }
    } else if (
      !SKIP_TYPES.has(child.type) &&
      Array.isArray((child as Parent).children)
    ) {
      replaceDocLinksInChildren(child as Parent);
      children.push(child as RootContent);
    } else {
      children.push(child as RootContent);
    }
  }
  if (changed) parent.children = children;
}

export function remarkDocLinks(): (tree: Root) => void {
  return (tree: Root) => {
    replaceDocLinksInChildren(tree);
  };
}
