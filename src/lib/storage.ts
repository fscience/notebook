import fs from "node:fs/promises";
import path from "node:path";
import { extractDocLinks, ROOT_DOC_NAME } from "@/lib/wiki";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface CellOutput {
  stdout?: string;
  stderr?: string;
  error?: string;
  timedOut?: boolean;
  images?: { name: string; data: string; mime: string }[];
  collapsed?: boolean;
}

export interface Cell {
  id: string;
  type: "markdown" | "code";
  content: string;
  output?: CellOutput;
}

export interface Document {
  name: string;
  cells: Cell[];
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: string;
}

export const DATA_ROOT = path.join(process.cwd(), "data");
export const PROJECTS_ROOT = path.join(DATA_ROOT, "projects");

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

export function projectDir(id: string): string {
  return path.join(PROJECTS_ROOT, ensureProjectId(id));
}

export function projectFilesDir(id: string): string {
  return path.join(projectDir(id), "files");
}

export function resolveFilePath(id: string, relPath = ""): string {
  const base = path.resolve(projectFilesDir(id));
  const clean = String(relPath || "").replace(/^\/+|\/+$/g, "");
  const target = path.resolve(base, clean);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Path escapes project directory");
  }
  return target;
}

export async function listProjects(): Promise<Project[]> {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects: Project[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await fs.readFile(
        path.join(PROJECTS_ROOT, e.name, "project.json"),
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
  const dir = projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(projectFilesDir(id), { recursive: true });
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
    JSON.stringify({ documents: [{ name: ROOT_DOC_NAME, cells: [] }] })
  );
  return project;
}

export async function getProject(id: string): Promise<Project> {
  const raw = await fs.readFile(
    path.join(projectDir(id), "project.json"),
    "utf8"
  );
  return JSON.parse(raw) as Project;
}

export async function renameProject(id: string, name: string): Promise<Project> {
  const clean = name.trim() || "未命名项目";
  const file = path.join(projectDir(id), "project.json");
  const raw = await fs.readFile(file, "utf8");
  const project = JSON.parse(raw) as Project;
  project.name = clean;
  await fs.writeFile(file, JSON.stringify(project, null, 2));
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(projectDir(id), { recursive: true, force: true });
}

export async function getDocuments(id: string): Promise<Document[]> {
  let docs: Document[] = [];
  let changed = false;
  try {
    const raw = await fs.readFile(
      path.join(projectDir(id), "content.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.documents)) {
      docs = parsed.documents.filter(
        (d: unknown): d is Document =>
          !!d &&
          typeof (d as Document).name === "string" &&
          Array.isArray((d as Document).cells)
      );
    } else if (parsed && Array.isArray(parsed.cells)) {
      docs = [{ name: ROOT_DOC_NAME, cells: parsed.cells as Cell[] }];
      changed = true;
    }
  } catch {
    /* empty content.json */
  }
  if (!docs.some((d) => d.name === ROOT_DOC_NAME)) {
    docs = [{ name: ROOT_DOC_NAME, cells: [] }, ...docs];
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
    path.join(projectDir(id), "content.json"),
    JSON.stringify({ documents: docs }, null, 2)
  );
}

function pruneOrphans(docs: Document[]): Document[] {
  const referenced = new Set<string>([ROOT_DOC_NAME]);
  for (const d of docs) {
    for (const c of d.cells) {
      if (c.type !== "markdown") continue;
      for (const name of extractDocLinks(c.content)) referenced.add(name);
    }
  }
  return docs.filter((d) => referenced.has(d.name));
}

export async function saveDocument(
  id: string,
  name: string,
  cells: Cell[]
): Promise<Document[]> {
  const docs = await getDocuments(id);
  const clean = String(name || "").trim() || ROOT_DOC_NAME;
  const idx = docs.findIndex((d) => d.name === clean);
  if (idx >= 0) docs[idx] = { name: clean, cells };
  else docs.push({ name: clean, cells });
  const pruned = pruneOrphans(docs);
  await saveDocuments(id, pruned);
  return pruned;
}

export async function listFiles(id: string, relPath = ""): Promise<FileEntry[]> {
  const dir = resolveFilePath(id, relPath);
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

export async function makeDir(
  id: string,
  relPath: string,
  name: string
): Promise<void> {
  const clean = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  if (!clean) throw new Error("文件夹名称无效");
  const parent = resolveFilePath(id, relPath);
  await fs.mkdir(path.join(parent, clean));
}

export async function removeEntry(id: string, relPath: string): Promise<void> {
  const target = resolveFilePath(id, relPath);
  if (target === path.resolve(projectFilesDir(id))) {
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
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  if (!clean) throw new Error("文件名无效");
  const sub = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const dir = resolveFilePath(id, sub ? `${relPath}/${sub}` : relPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, clean), buffer);
}

export async function fileMeta(id: string, relPath: string) {
  const target = resolveFilePath(id, relPath);
  const st = await fs.stat(target);
  if (st.isDirectory()) throw new Error("Is a directory");
  return { target, size: st.size };
}
