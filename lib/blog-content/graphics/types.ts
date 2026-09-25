import { z } from 'zod';

/* Graphic config schemas — the single contract shared by the editor (insert/edit
   forms + Quill blot) and the public render. Zod validates on decode so a malformed
   or stale placeholder degrades gracefully instead of crashing the article. */

export const statCardSchema = z.object({
  prefix: z.string().optional(),
  number: z.number(),
  suffix: z.string().optional(),
  label: z.string(),
  barColor: z.string(),
  caption: z.string().optional(),
});

export const statCardsConfigSchema = z.object({
  type: z.literal('stat-cards'),
  animate: z.boolean(),
  cards: z.array(statCardSchema).min(2).max(4),
});

export const calloutConfigSchema = z.object({
  type: z.literal('callout'),
  animate: z.boolean(),
  eyebrow: z.string().optional(),
  text: z.string(),
  attribution: z.string().optional(),
  accentColor: z.string(),
  variant: z.enum(['quote', 'info']),
});

export const comparisonColumnSchema = z.object({
  heading: z.string(),
  points: z.array(z.string()),
});

export const comparisonConfigSchema = z.object({
  type: z.literal('comparison'),
  animate: z.boolean(),
  accentColor: z.string(),
  columns: z.array(comparisonColumnSchema).length(2),
});

export const graphicConfigSchema = z.discriminatedUnion('type', [
  statCardsConfigSchema,
  calloutConfigSchema,
  comparisonConfigSchema,
]);

export type StatCard = z.infer<typeof statCardSchema>;
export type StatCardsConfig = z.infer<typeof statCardsConfigSchema>;
export type CalloutConfig = z.infer<typeof calloutConfigSchema>;
export type ComparisonConfig = z.infer<typeof comparisonConfigSchema>;
export type GraphicConfig = z.infer<typeof graphicConfigSchema>;
export type GraphicType = GraphicConfig['type'];
