export const MIGRATION_GROUPS = [
  'authors',
  'posts',
  'whitepapers',
  'faqs',
  'faq-submissions',
  'subscribers',
  'release-notes',
] as const;

export type MigrationGroup = (typeof MIGRATION_GROUPS)[number];

export interface MigrationOptions {
  sourceUri: string;
  targetUri: string;
  targetDbName: string;
  siteSlug: string;
  siteName: string;
  siteOrigin: string;
  dryRun: boolean;
  only: readonly MigrationGroup[];
  releaseNotesDirectory?: string;
  whitepapersDirectory?: string;
  faqSeedJson?: string;
}

export interface MigrationCount {
  group: MigrationGroup;
  source: number;
  target: number;
  match: boolean;
}

export interface MigrationResult {
  dryRun: boolean;
  counts: MigrationCount[];
  warnings: string[];
  matches: boolean;
}

export interface FaqSeed {
  question: string;
  answer: string;
  category: string;
  order: number;
}

export interface StaticWhitepaper {
  title: string;
  slug: string;
  description: string;
  date: string;
  author: string;
  authorRole: string;
  readTime: string;
  tags: string[];
  headline: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  tag: string;
  status: 'publish';
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  isFeatured: boolean;
}
