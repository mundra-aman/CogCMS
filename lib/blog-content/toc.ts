export type TocEntry = { id: string; text: string; level: number };
export type TocOverride = { id: string; label?: string; hidden?: boolean };

export function applyTocOverrides(toc: TocEntry[], overrides: TocOverride[]): TocEntry[] {
  const byId = new Map(overrides.map((override) => [override.id, override]));
  return toc.flatMap((entry) => {
    const override = byId.get(entry.id);
    if (override?.hidden) return [];
    return [
      {
        id: entry.id,
        text: override?.label?.trim() || entry.text,
        level: entry.level,
      },
    ];
  });
}
