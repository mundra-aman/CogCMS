import { describe, expect, it } from 'vitest';
import { parseProvisionArgs } from './ensure-published-views';

const id = '0123456789abcdef01234567';
describe('published view operator arguments', () => {
  it('requires an explicit valid site and refuses unknown or ambiguous options', () => {
    for (const args of [
      [],
      ['--site', 'bad'],
      ['--site', id, '--force'],
      ['--site', id, '--write', '--dry-run'],
    ]) {
      expect(() => parseProvisionArgs(args)).toThrow();
    }
  });
  it('defaults to dry-run and only enables writes explicitly', () => {
    expect(parseProvisionArgs(['--site', id])).toEqual({ site: id, write: false });
    expect(parseProvisionArgs(['--site', id, '--dry-run'])).toEqual({ site: id, write: false });
    expect(parseProvisionArgs(['--site', id, '--write'])).toEqual({ site: id, write: true });
  });
});
