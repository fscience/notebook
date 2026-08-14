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
}

export interface Cell {
  id: string;
  type: "markdown" | "code";
  content: string;
  output?: CellOutput;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: string;
}
