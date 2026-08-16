export interface MarkdownBlock {
  source: string;
  start: number;
  end: number;
}

const BLANK_RE = /^[ \t]*$/;
const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const QUOTE_RE = /^ {0,3}>/;
const LIST_ITEM_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/;
const THEMATIC_RE = /^ {0,3}(?:[*_-][ \t]*){3,}[ \t]*$/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const INDENTED_CODE_RE = /^(?: {4,}|\t)/;

function leadingSpaces(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

function itemFamily(line: string): "bullet" | "ordered" | null {
  const m = /^ {0,3}([-+*]|\d{1,9}[.)])[ \t]+/.exec(line);
  if (!m) return null;
  return /\d/.test(m[1]) ? "ordered" : "bullet";
}

export function splitMarkdownBlocks(src: string): MarkdownBlock[] {
  const lines = src.split("\n");
  const lineStart: number[] = [];
  let pos = 0;
  for (const line of lines) {
    lineStart.push(pos);
    pos += line.length + 1;
  }
  const blocks: MarkdownBlock[] = [];

  const single = (i: number) => ({
    source: lines[i],
    start: lineStart[i],
    end:
      lineStart[i] +
      lines[i].length +
      (i < lines.length - 1 ? 1 : 0),
  });

  const rangeEnd = (lastIdx: number) =>
    lineStart[lastIdx] +
    lines[lastIdx].length +
    (lastIdx < lines.length - 1 ? 1 : 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK_RE.test(line)) {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const ch = fence[1][0];
      const closeRe =
        ch === "`" ? /^ {0,3}`+[ \t]*$/ : /^ {0,3}~+[ \t]*$/;
      let j = i + 1;
      while (j < lines.length) {
        if (closeRe.test(lines[j])) break;
        j++;
      }
      if (j >= lines.length) j = lines.length - 1;
      blocks.push({
        source: lines.slice(i, j + 1).join("\n"),
        start: lineStart[i],
        end: rangeEnd(j),
      });
      i = j + 1;
      continue;
    }
    if (ATX_RE.test(line)) {
      blocks.push(single(i));
      i++;
      continue;
    }
    if (THEMATIC_RE.test(line)) {
      blocks.push(single(i));
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      let j = i;
      while (j < lines.length && QUOTE_RE.test(lines[j])) j++;
      blocks.push({
        source: lines.slice(i, j).join("\n"),
        start: lineStart[i],
        end: rangeEnd(j - 1),
      });
      i = j;
      continue;
    }
    if (LIST_ITEM_RE.test(line)) {
      const baseIndent = leadingSpaces(line);
      const family = itemFamily(line);
      const listLines = [line];
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (BLANK_RE.test(l)) {
          let k = j;
          while (k < lines.length && BLANK_RE.test(lines[k])) k++;
          if (
            k < lines.length &&
            (itemFamily(lines[k]) === family ||
              leadingSpaces(lines[k]) > baseIndent)
          ) {
            while (k < lines.length && BLANK_RE.test(lines[k])) {
              listLines.push(lines[k]);
              k++;
            }
            j = k;
            continue;
          }
          break;
        }
        if (
          itemFamily(l) === family ||
          leadingSpaces(l) > baseIndent
        ) {
          listLines.push(l);
          j++;
          continue;
        }
        break;
      }
      blocks.push({
        source: listLines.join("\n"),
        start: lineStart[i],
        end: rangeEnd(j - 1),
      });
      i = j;
      continue;
    }
    if (INDENTED_CODE_RE.test(line)) {
      let j = i;
      while (j < lines.length) {
        const l = lines[j];
        if (BLANK_RE.test(l)) break;
        if (FENCE_RE.test(l) || ATX_RE.test(l) || THEMATIC_RE.test(l)) break;
        if (!INDENTED_CODE_RE.test(l) && !BLANK_RE.test(l)) break;
        j++;
      }
      if (j <= i) {
        blocks.push(single(i));
        i++;
        continue;
      }
      blocks.push({
        source: lines.slice(i, j).join("\n"),
        start: lineStart[i],
        end: rangeEnd(j - 1),
      });
      i = j;
      continue;
    }
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (BLANK_RE.test(l)) break;
      if (
        ATX_RE.test(l) ||
        FENCE_RE.test(l) ||
        THEMATIC_RE.test(l) ||
        QUOTE_RE.test(l) ||
        LIST_ITEM_RE.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      j++;
    }
    if (
      j < lines.length &&
      SETEXT_RE.test(lines[j]) &&
      !THEMATIC_RE.test(lines[j])
    ) {
      paraLines.push(lines[j]);
      j++;
    }
    blocks.push({
      source: paraLines.join("\n"),
      start: lineStart[i],
      end: rangeEnd(j - 1),
    });
    i = j;
  }

  for (let k = 0; k < blocks.length; k++) {
    const start = blocks[k].start;
    const end = k + 1 < blocks.length ? blocks[k + 1].start : src.length;
    blocks[k] = { source: src.slice(start, end), start, end };
  }

  return blocks;
}
