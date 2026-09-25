export interface ReleaseNoteItem {
  type: 'paragraph' | 'bullet' | 'numbered' | 'subheading';
  text: string;
}

export interface ReleaseNoteSection {
  title: string;
  items: ReleaseNoteItem[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  dateIso: string;
  slug: string;
  filename: string;
  intro: string[];
  sections: ReleaseNoteSection[];
}

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

export function parseDateString(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const monthMatch = trimmed.match(/^(\w+)\s+(\d{1,2})\s*,?\s+(\d{4})$/);
  if (monthMatch) {
    const month = MONTHS[monthMatch[1].toLowerCase()];
    const day = Number.parseInt(monthMatch[2], 10);
    const year = Number.parseInt(monthMatch[3], 10);
    if (month !== undefined && day >= 1 && day <= 31 && year >= 2000) {
      const parsed = new Date(Date.UTC(year, month, day));
      if (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month &&
        parsed.getUTCDate() === day
      ) {
        return parsed;
      }
    }
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return parseDateInput(trimmed);
  return null;
}

export function parseDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function toDateInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHumanDateFromInput(value: string): string | null {
  const parsed = parseDateInput(value);
  if (!parsed) return null;

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function slugFromVersion(version: string): string {
  return `v${version.replace(/\./g, '-')}`;
}

function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.md\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deduplicateSlugs(notes: ReleaseNote[]): ReleaseNote[] {
  const seen = new Map<string, number>();

  return notes.map((note) => {
    const base = note.slug;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? note : { ...note, slug: `${base}-${count + 1}` };
  });
}

function parseVersionParts(version: string): number[] {
  return version
    .split('.')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isFinite(part));
}

function compareVersionsDesc(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;
    if (aValue !== bValue) return bValue - aValue;
  }

  return 0;
}

function normalizeVersionString(version: string): string {
  return version
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHeaderLine(line: string): { version: string; date: string } | null {
  const stripped = line.trim().replace(/^#{1,6}\s*/, '');
  if (!/^version\s+/i.test(stripped) || !stripped.includes('|')) return null;

  const withoutPrefix = stripped.replace(/^version\s+/i, '');
  const pipeIndex = withoutPrefix.indexOf('|');
  if (pipeIndex < 0) return null;

  const version = normalizeVersionString(withoutPrefix.slice(0, pipeIndex).trim());
  const date = withoutPrefix.slice(pipeIndex + 1).trim();
  if (!version) return null;

  return { version, date };
}

function parseVersionAndDateFromFilename(
  filename: string,
): { version: string; date: string; dateIso: string } | null {
  const base = filename.replace(/\.md\s*$/i, '');
  const match = base.match(/version[_-]([0-9][0-9.\s_-]*)[_-](\d{8})/i);
  if (!match) return null;

  const version = normalizeVersionString(match[1].replace(/[_-]+/g, '.').replace(/\.+/g, '.'));
  const token = match[2];
  const year = Number.parseInt(token.slice(0, 4), 10);
  const month = Number.parseInt(token.slice(4, 6), 10);
  const day = Number.parseInt(token.slice(6, 8), 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    !version ||
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const date = parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return { version, date, dateIso: parsed.toISOString() };
}

export function extractReleaseNoteBody(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let lineIndex = 0;

  if (lines[lineIndex]?.trim().toLowerCase() === '# release notes') {
    lineIndex += 1;
  }

  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex += 1;
  }

  if (lineIndex < lines.length && parseHeaderLine(lines[lineIndex].trim())) {
    lineIndex += 1;
  }

  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex += 1;
  }

  return lines.slice(lineIndex).join('\n').trim();
}

export function buildReleaseNoteMarkdown(
  version: string,
  dateLabel: string,
  bodyMarkdown: string,
): string {
  const header = `# Release Notes\nVersion ${version.trim()} | ${dateLabel.trim()}`;
  const body = bodyMarkdown.trim();
  return body ? `${header}\n\n${body}\n` : `${header}\n`;
}

export function parseReleaseNoteFile(content: string, filename: string): ReleaseNote {
  const lines = content.split('\n');

  let version = '';
  let date = '';
  let dateIso = '';
  const intro: string[] = [];
  const sections: ReleaseNoteSection[] = [];

  let currentSection: ReleaseNoteSection | null = null;
  let inIntro = true;
  const pendingLines: string[] = [];

  const flushParagraph = () => {
    const text = pendingLines.join(' ').trim();
    pendingLines.length = 0;
    if (!text) return;

    if (inIntro) {
      intro.push(text);
      return;
    }

    if (currentSection) {
      currentSection.items.push({ type: 'paragraph', text });
    }
  };

  for (const line of lines) {
    if (line.startsWith('# ')) continue;

    const parsedHeader = parseHeaderLine(line);
    if (parsedHeader) {
      version = parsedHeader.version;
      date = parsedHeader.date;
      const parsed = parseDateString(date);
      if (parsed) dateIso = parsed.toISOString();
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      inIntro = false;
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(3).trim(), items: [] };
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      const text = line.slice(4).trim();
      if (currentSection) {
        currentSection.items.push({ type: 'subheading', text });
      } else {
        pendingLines.push(text);
      }
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      const text = line.slice(2).trim();
      if (currentSection) {
        currentSection.items.push({ type: 'bullet', text });
      } else {
        pendingLines.push(text);
      }
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      const text = line.replace(/^\d+\.\s/, '').trim();
      if (currentSection) {
        currentSection.items.push({ type: 'numbered', text });
      } else {
        pendingLines.push(text);
      }
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    pendingLines.push(line.trim());
  }

  flushParagraph();
  if (currentSection) sections.push(currentSection);

  const fallbackFromFilename = parseVersionAndDateFromFilename(filename);
  if (fallbackFromFilename) {
    if (!version) version = fallbackFromFilename.version;
    if (!date) date = fallbackFromFilename.date;
    if (!dateIso) dateIso = fallbackFromFilename.dateIso;
  }

  const slug = version.trim() ? slugFromVersion(version) : slugFromFilename(filename);
  if (!dateIso) dateIso = new Date(0).toISOString();

  return { version, date, dateIso, slug, filename, intro, sections };
}

export function normalizeReleaseNotes(notes: ReleaseNote[]): ReleaseNote[] {
  const sorted = [...notes].sort((a, b) => {
    const dateDiff = new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime();
    if (dateDiff !== 0) return dateDiff;

    return compareVersionsDesc(a.version, b.version);
  });

  return deduplicateSlugs(sorted);
}
