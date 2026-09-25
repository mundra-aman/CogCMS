import { describe, expect, it } from 'vitest';
import { newsletterSubscriberInputSchema } from './newsletter-subscriber';

describe('newsletter subscriber validation', () => {
  it('trims and lowercases a valid email before returning it', () => {
    expect(newsletterSubscriberInputSchema.parse({ email: ' Reader@Example.COM ' })).toMatchObject({
      email: 'reader@example.com',
      source: 'footer',
    });
  });
});
