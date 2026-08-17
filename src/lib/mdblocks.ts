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

export interface BlockSplit {
  newSource: string;
  newCaret: number;
}

const ORDERED_ITEM_RE = /^( {0,3})(\d{1,9})([.)])([ \t]+)/;
const BULLET_ITEM_RE = /^( {0,3})([-+*])([ \t]+)/;

export function splitBlockEnter(source: string, caret: number): BlockSplit {
  const contentPart = source.replace(/\n+$/, "");
  const p = Math.min(Math.max(0, caret), contentPart.length);
  const before = source.slice(0, p);
  const after = source.slice(p).replace(/\n+$/, "");
  const lineStart = contentPart.lastIndexOf("\n", p - 1) + 1;
  const lineEndIdx = contentPart.indexOf("\n", p);
  const lineEnd = lineEndIdx === -1 ? contentPart.length : lineEndIdx;
  const linePrefix = contentPart.slice(lineStart, p);
  const curLine = contentPart.slice(lineStart, lineEnd);
  const afterLines = lineEndIdx === -1 ? "" : contentPart.slice(lineEndIdx + 1);
  const atLineStart = p === lineStart;

  const first = contentPart.split("\n").find((l) => !BLANK_RE.test(l)) ?? "";
  if (QUOTE_RE.test(first)) {
    return splitQuoteEnter(
      before,
      after,
      contentPart,
      lineStart,
      lineEnd,
      curLine,
      atLineStart
    );
  }
  if (ORDERED_ITEM_RE.test(first)) {
    return splitOrderedEnter(
      contentPart,
      p,
      lineStart,
      lineEnd,
      curLine,
      afterLines
    );
  }
  if (BULLET_ITEM_RE.test(first)) {
    return splitBulletEnter(
      before,
      after,
      contentPart,
      lineStart,
      lineEnd,
      linePrefix,
      curLine,
      atLineStart
    );
  }
  return { newSource: before + "\n\n" + after, newCaret: before.length + 2 };
}

function splitQuoteEnter(
  before: string,
  after: string,
  contentPart: string,
  lineStart: number,
  lineEnd: number,
  curLine: string,
  atLineStart: boolean
): BlockSplit {
  if (/^ {0,3}>[ \t]*$/.test(curLine)) {
    const prefixPart = contentPart.slice(0, lineStart);
    const suffixPart = contentPart.slice(lineEnd).replace(/^\n+/, "");
    return {
      newSource: prefixPart + "\n\n" + suffixPart,
      newCaret: prefixPart.length + 2,
    };
  }
  if (atLineStart) {
    if (QUOTE_RE.test(curLine)) {
      return { newSource: before + "> \n" + after, newCaret: before.length + 2 };
    }
    return { newSource: before + "\n\n" + after, newCaret: before.length + 2 };
  }
  return { newSource: before + "\n> " + after, newCaret: before.length + 3 };
}

function splitBulletEnter(
  before: string,
  after: string,
  contentPart: string,
  lineStart: number,
  lineEnd: number,
  linePrefix: string,
  curLine: string,
  atLineStart: boolean
): BlockSplit {
  const mm = BULLET_ITEM_RE.exec(curLine);
  if (mm && /^ {0,3}[-+*][ \t]*$/.test(curLine)) {
    const prefixPart = contentPart.slice(0, lineStart);
    const suffixPart = contentPart.slice(lineEnd).replace(/^\n+/, "");
    return {
      newSource: prefixPart + "\n\n" + suffixPart,
      newCaret: prefixPart.length + 2,
    };
  }
  if (atLineStart) {
    if (mm) {
      const marker = mm[1] + mm[2] + " ";
      return {
        newSource: before + marker + "\n" + after,
        newCaret: before.length + marker.length,
      };
    }
    return { newSource: before + "\n\n" + after, newCaret: before.length + 2 };
  }
  const m = BULLET_ITEM_RE.exec(linePrefix);
  if (!m) {
    return { newSource: before + "\n\n" + after, newCaret: before.length + 2 };
  }
  return {
    newSource: before + "\n" + m[1] + m[2] + " " + after,
    newCaret: before.length + 1 + m[1].length + m[2].length + 1,
  };
}

function splitOrderedEnter(
  contentPart: string,
  p: number,
  lineStart: number,
  lineEnd: number,
  curLine: string,
  afterLines: string
): BlockSplit {
  const m = ORDERED_ITEM_RE.exec(curLine);
  if (!m) {
    const before = contentPart.slice(0, p);
    const after = contentPart.slice(p);
    return { newSource: before + "\n\n" + after, newCaret: before.length + 2 };
  }
  const indent = m[1];
  const num = parseInt(m[2], 10);
  const marker = m[3];
  const emptyItem = curLine.slice(m[0].length).trim() === "";
  if (emptyItem) {
    const prefixPart = contentPart.slice(0, lineStart);
    const suffixPart = contentPart.slice(lineEnd).replace(/^\n+/, "");
    return {
      newSource: prefixPart + "\n\n" + suffixPart,
      newCaret: prefixPart.length + 2,
    };
  }
  if (p === lineStart) {
    const newItem = indent + (num + 1) + marker + " ";
    const raw =
      contentPart.slice(0, p) + newItem + "\n" + contentPart.slice(lineStart);
    return renumberOrdered(raw, p + newItem.length);
  }
  const prefix = contentPart.slice(0, p);
  const lineRest = curLine.slice(p - lineStart);
  const newItem = indent + (num + 1) + marker + " " + lineRest;
  const raw =
    prefix + "\n" + newItem + (afterLines ? "\n" + afterLines : "");
  const caret = prefix.length + 1 + newItem.length - lineRest.length;
  return renumberOrdered(raw, caret);
}

function renumberOrdered(raw: string, caret: number): BlockSplit {
  const lines = raw.split("\n");
  const offsets = new Map<string, number>();
  const counts = new Map<string, number>();
  const out: string[] = [];
  let cur = caret;
  let cumShift = 0;
  let lineStart = 0;
  for (const line of lines) {
    const m = ORDERED_ITEM_RE.exec(line);
    if (m) {
      const key = m[1] + m[3];
      let off = offsets.get(key);
      if (off === undefined) {
        off = parseInt(m[2], 10) - 1;
        offsets.set(key, off);
        counts.set(key, 0);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const newNum = String(off + counts.get(key)!);
      const numStart = m[1].length;
      const newLine =
        m[1] + newNum + m[3] + line.slice(numStart + m[2].length + m[3].length);
      const lenDiff = newNum.length - m[2].length;
      const absNumStart = lineStart + cumShift + numStart;
      const absNumEnd = absNumStart + newNum.length;
      if (absNumEnd <= cur) cur += lenDiff;
      else if (absNumStart < cur) cur = absNumStart + newNum.length;
      cumShift += lenDiff;
      out.push(newLine);
    } else {
      out.push(line);
    }
    lineStart += line.length + 1;
  }
  return { newSource: out.join("\n"), newCaret: cur };
}
