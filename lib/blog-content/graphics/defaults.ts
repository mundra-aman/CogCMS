import type {
  GraphicType,
  StatCardsConfig,
  CalloutConfig,
  ComparisonConfig,
} from './types';

/* Starter configs for the insert flow — a fresh object per call so each inserted
   graphic owns its state. Authors then edit the values in the form. */

const BRAND = '#FF751F';

export const GRAPHIC_DEFAULTS: {
  'stat-cards': () => StatCardsConfig;
  callout: () => CalloutConfig;
  comparison: () => ComparisonConfig;
} & Record<GraphicType, () => StatCardsConfig | CalloutConfig | ComparisonConfig> = {
  'stat-cards': () => ({
    type: 'stat-cards',
    animate: true,
    cards: [
      { number: 250, suffix: 'B+', label: 'Label one', barColor: BRAND, caption: 'Short supporting line.' },
      { number: 13, suffix: 'T', label: 'Label two', barColor: BRAND, caption: 'Short supporting line.' },
      { prefix: '$', number: 100, suffix: 'M+', label: 'Label three', barColor: BRAND, caption: 'Short supporting line.' },
    ],
  }),
  callout: () => ({
    type: 'callout',
    animate: true,
    eyebrow: '',
    text: 'A short, quotable statement worth highlighting.',
    attribution: '',
    accentColor: BRAND,
    variant: 'quote',
  }),
  comparison: () => ({
    type: 'comparison',
    animate: true,
    accentColor: BRAND,
    columns: [
      { heading: 'Before', points: ['First point', 'Second point'] },
      { heading: 'After', points: ['First point', 'Second point'] },
    ],
  }),
};
