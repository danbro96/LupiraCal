import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { guidFromMd5Hex, residencyStreamKey } from './ids';

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

describe('guidFromMd5Hex', () => {
  // Pinned against real .NET output: `new Guid(MD5.HashData(Encoding.UTF8.GetBytes(v)))`.
  it.each([
    ['hello@x', '11a34698-6c18-99eb-f487-5034cd023daf'],
    ['0198c0de-0000-7000-8000-000000000000@mobile', 'b137e822-f766-a673-54f1-d7bc252de297'],
  ])('matches DeterministicGuid.From(%s)', (input, expected) => {
    expect(guidFromMd5Hex(md5(input))).toBe(expected);
  });

  it('rejects non-md5 input', () => {
    expect(() => guidFromMd5Hex('nope')).toThrow();
  });
});

describe('residencyStreamKey', () => {
  // Pinned against ContactApi ResidencyTests: Residency.StreamIdOf(contact, key).
  it('derives the residency id the server assigns for a source key', () => {
    const key = residencyStreamKey('0199D6A0-0000-7000-8000-000000000001', ' 0199d6a0-1111-7000-8000-000000000002 ');
    expect(guidFromMd5Hex(md5(key))).toBe('f36186cb-8873-f92c-16e9-2c6cd44de782');
  });
});
