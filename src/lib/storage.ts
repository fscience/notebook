import fs from "node:fs/promises";
import path from "node:path";
import { extractDocLinks, ROOT_DOC_NAME } from "@/lib/wiki";
import { parseContent, runBlockKey, serializeBlock, type RunSegment } from "@/lib/runblock";
import type { CellOutput, Document, FileEntry, Project } from "@/lib/types";

export type { CellOutput, Document, FileEntry, Project };

interface LegacyCell {
  id?: string;
  type: "markdown" | "code" | "shell";
  content: string;
  output?: CellOutput;
}

export const DEFAULT_DATA_ROOT = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DEFAULT_DATA_ROOT, "settings.json");

export interface Settings {
  dataRoot?: string;
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const dataRoot = (parsed as Settings).dataRoot;
      if (typeof dataRoot === "string" && dataRoot.trim()) {
        return { dataRoot: dataRoot.trim() };
      }
    }
  } catch {
    /* no settings yet */
  }
  return {};
}

export async function saveSettings(settings: Settings): Promise<void> {
  await fs.mkdir(DEFAULT_DATA_ROOT, { recursive: true });
  const next: Settings = {
    dataRoot:
      settings.dataRoot && settings.dataRoot.trim()
        ? path.resolve(settings.dataRoot.trim())
        : undefined,
  };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
}

export async function getDataRoot(): Promise<string> {
  const settings = await getSettings();
  return settings.dataRoot || DEFAULT_DATA_ROOT;
}

export async function getProjectsRoot(): Promise<string> {
  return path.join(await getDataRoot(), "projects");
}

export function ensureProjectId(id: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new Error("Invalid project id");
  }
  return id;
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "project";
}

export async function projectDir(id: string): Promise<string> {
  return path.join(await getProjectsRoot(), ensureProjectId(id));
}

export async function projectFilesDir(id: string): Promise<string> {
  return path.join(await projectDir(id), "files");
}

export async function resolveFilePath(
  id: string,
  relPath = ""
): Promise<string> {
  const base = path.resolve(await projectFilesDir(id));
  const clean = String(relPath || "").replace(/^\/+|\/+$/g, "");
  const target = path.resolve(base, clean);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Path escapes project directory");
  }
  return target;
}

export async function listProjects(): Promise<Project[]> {
  const root = await getProjectsRoot();
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects: Project[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await fs.readFile(
        path.join(root, e.name, "project.json"),
        "utf8"
      );
      projects.push(JSON.parse(raw) as Project);
    } catch {
      /* skip malformed */
    }
  }
  return projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createProject(name: string): Promise<Project> {
  const id = `${slugify(name)}-${Date.now().toString(36)}`;
  const dir = await projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(await projectFilesDir(id), { recursive: true });
  const project: Project = {
    id,
    name: name.trim() || "未命名项目",
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(project, null, 2)
  );
  await fs.writeFile(
    path.join(dir, "content.json"),
    JSON.stringify({ documents: [{ name: ROOT_DOC_NAME, content: "" }] })
  );
  return project;
}

export async function getProject(id: string): Promise<Project> {
  const raw = await fs.readFile(
    path.join(await projectDir(id), "project.json"),
    "utf8"
  );
  return JSON.parse(raw) as Project;
}

export async function renameProject(id: string, name: string): Promise<Project> {
  const clean = name.trim() || "未命名项目";
  const file = path.join(await projectDir(id), "project.json");
  const raw = await fs.readFile(file, "utf8");
  const project = JSON.parse(raw) as Project;
  project.name = clean;
  await fs.writeFile(file, JSON.stringify(project, null, 2));
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(await projectDir(id), { recursive: true, force: true });
}

function migrateDocument(
  d: { name?: unknown; content?: unknown; cells?: unknown; outputs?: unknown }
): Document {
  const name = typeof d.name === "string" && d.name ? d.name : ROOT_DOC_NAME;
  if (typeof d.content === "string") {
    return {
      name,
      content: d.content,
      ...(d.outputs && typeof d.outputs === "object"
        ? { outputs: d.outputs as Record<string, CellOutput> }
        : {}),
    };
  }
  const cells: LegacyCell[] = Array.isArray(d.cells)
    ? d.cells.filter(
        (c): c is LegacyCell =>
          !!c &&
          typeof (c as LegacyCell).content === "string" &&
          ["markdown", "code", "shell"].includes(
            (c as LegacyCell).type
          )
      )
    : [];
  const outputs: Record<string, CellOutput> = {};
  let content = "";
  for (const cell of cells) {
    let piece = "";
    if (cell.type === "markdown") {
      piece = cell.content;
    } else {
      const kind = cell.type === "code" ? "python" : "shell";
      piece = serializeBlock(kind, cell.content);
      if (cell.output) {
        outputs[runBlockKey(kind, cell.content)] = cell.output;
      }
    }
    content += (content ? "\n" : "") + piece;
  }
  return { name, content, outputs };
}

export async function getDocuments(id: string): Promise<Document[]> {
  let docs: Document[] = [];
  let changed = false;
  try {
    const raw = await fs.readFile(
      path.join(await projectDir(id), "content.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.documents)) {
      docs = parsed.documents.map((d: unknown) => {
        const migrated = migrateDocument(
          d as { name?: unknown; content?: unknown; cells?: unknown }
        );
        if (!(d && typeof (d as { content?: unknown }).content === "string")) {
          changed = true;
        }
        return migrated;
      });
    } else if (parsed && Array.isArray(parsed.cells)) {
      docs = [migrateDocument({ name: ROOT_DOC_NAME, cells: parsed.cells })];
      changed = true;
    }
  } catch {
    /* empty content.json */
  }
  if (!docs.some((d) => d.name === ROOT_DOC_NAME)) {
    docs = [{ name: ROOT_DOC_NAME, content: "" }, ...docs];
    changed = true;
  }
  if (changed) await saveDocuments(id, docs);
  return docs;
}

export async function saveDocuments(
  id: string,
  docs: Document[]
): Promise<void> {
  await fs.writeFile(
    path.join(await projectDir(id), "content.json"),
    JSON.stringify({ documents: docs }, null, 2)
  );
}

function pruneOrphans(docs: Document[]): Document[] {
  const referenced = new Set<string>([ROOT_DOC_NAME]);
  for (const d of docs) {
    for (const seg of parseContent(d.content)) {
      if (seg.kind !== "markdown") continue;
      for (const name of extractDocLinks(seg.content)) referenced.add(name);
    }
  }
  return docs.filter((d) => referenced.has(d.name));
}

export async function saveDocument(
  id: string,
  name: string,
  content: string,
  outputs: Record<string, CellOutput>
): Promise<Document[]> {
  const docs = await getDocuments(id);
  const clean = String(name || "").trim() || ROOT_DOC_NAME;
  const validKeys = new Set(
    parseContent(content)
      .filter((s): s is RunSegment => s.kind !== "markdown")
      .map((s) => s.key)
  );
  const prunedOutputs = Object.fromEntries(
    Object.entries(outputs).filter(([key]) => validKeys.has(key))
  );
  const doc: Document = { name: clean, content, outputs: prunedOutputs };
  const idx = docs.findIndex((d) => d.name === clean);
  if (idx >= 0) docs[idx] = doc;
  else docs.push(doc);
  const pruned = pruneOrphans(docs);
  await saveDocuments(id, pruned);
  return pruned;
}

export async function listFiles(id: string, relPath = ""): Promise<FileEntry[]> {
  const dir = await resolveFilePath(id, relPath);
  const st = await fs.stat(dir);
  if (!st.isDirectory()) throw new Error("Not a directory");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: FileEntry[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      const s = await fs.stat(full);
      out.push({
        name: e.name,
        path: path.join(relPath, e.name),
        isDir: e.isDirectory(),
        size: s.isDirectory() ? 0 : s.size,
        mtime: s.mtime.toISOString(),
      });
    } catch {
      /* ignore unreadable */
    }
  }
  out.sort((a, b) =>
    a.isDir === b.isDir
      ? a.name.localeCompare(b.name)
      : a.isDir
        ? -1
        : 1
  );
  return out;
}

function sanitizeName(name: string, label: string): string {
  const clean = String(name || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  if (!clean) throw new Error(`${label}名称无效`);
  return clean;
}

export async function makeDir(
  id: string,
  relPath: string,
  name: string
): Promise<void> {
  const clean = sanitizeName(name, "文件夹");
  const parent = await resolveFilePath(id, relPath);
  await fs.mkdir(path.join(parent, clean));
}

export async function removeEntry(id: string, relPath: string): Promise<void> {
  const target = await resolveFilePath(id, relPath);
  if (target === path.resolve(await projectFilesDir(id))) {
    throw new Error("不能删除项目根目录");
  }
  await fs.rm(target, { recursive: true, force: true });
}

export async function saveUploadedFile(
  id: string,
  relPath: string,
  subpath: string,
  name: string,
  buffer: Buffer
): Promise<void> {
  const clean = sanitizeName(name, "文件");
  const sub = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const dir = await resolveFilePath(id, sub ? `${relPath}/${sub}` : relPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, clean), buffer);
}

export async function fileMeta(id: string, relPath: string) {
  const target = await resolveFilePath(id, relPath);
  const st = await fs.stat(target);
  if (st.isDirectory()) throw new Error("Is a directory");
  return { target, size: st.size };
}
