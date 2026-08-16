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

export interface Document {
  name: string;
  content: string;
  outputs?: Record<string, CellOutput>;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: string;
}
