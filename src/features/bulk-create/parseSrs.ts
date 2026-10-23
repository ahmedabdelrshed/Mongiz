import { newStory, type StoryDraft } from "./model";
export interface ParsedSrs {
  stories: StoryDraft[];
  warnings: string[];
  error?: string;
}
// Only a new line starts a requirement. References to SRS IDs inside sentences stay in that story.
const start = /^\s*(?:(?:[-*•]|\d+[.)])\s+)?(SRS(?:[.\s_-]+\d+)+)\b(.*)$/i;
export function parseSrs(text: string): ParsedSrs {
  if (text.length > 200000)
    return {
      stories: [],
      warnings: [],
      error: "Paste at most 200,000 characters at once.",
    };
  const blocks: { code: string; header: string; lines: string[] }[] = [],
    preamble: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const match = raw.match(start);
    if (match) {
      const code =
        "SRS." +
        match[1]
          .replace(/^SRS/i, "")
          .split(/[.\s_-]+/)
          .filter(Boolean)
          .join(".");
      blocks.push({ code, header: code + match[2], lines: [] });
    } else if (blocks.length) blocks[blocks.length - 1].lines.push(raw);
    else if (raw.trim()) preamble.push(raw);
  }
  if (!blocks.length)
    return {
      stories: [],
      warnings: [],
      error:
        "No stories found. Start each story on a new line with an ID such as SRS.7.7.48.",
    };
  if (blocks.length > 100)
    return {
      stories: [],
      warnings: [],
      error: "Import at most 100 stories in one batch.",
    };
  const ids = new Set<string>();
  for (const b of blocks) {
    if (ids.has(b.code))
      return {
        stories: [],
        warnings: [],
        error: `Repeated identifier ${b.code}. Keep each SRS identifier once in the pasted text.`,
      };
    ids.add(b.code);
  }
  const warnings = preamble.length
    ? [
        "Text before the first SRS identifier is not included. It remains in the paste box.",
      ]
    : [];
  const stories = blocks.map((b) => {
    // Keep all requirement text in the title; flatten pasted line breaks.
    const title = [b.header, ...b.lines].join(" ").replace(/\s+/g, " ").trim();
    if (title.length > 255)
      warnings.push(
        `${b.code}: title has ${title.length} characters. All text is retained; shorten it to 255 characters in the draft before creating in Azure.`,
      );
    return { ...newStory(), title, criteria: "" };
  });
  return { stories, warnings };
}
export function srsCode(title: string) {
  return title
    .match(/^SRS(?:[.\s_-]+\d+)+\b/i)?.[0]
    .toUpperCase()
    .replace(/[\s_-]+/g, ".");
}
