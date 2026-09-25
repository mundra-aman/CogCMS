import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

describe('integration database', () => {
  it('connects to the isolated in-memory Mongo database', () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.name).toMatch(/^cognerd_cms_test_/);
  });
});
