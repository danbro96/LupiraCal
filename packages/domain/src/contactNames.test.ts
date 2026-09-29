import { describe, expect, it } from 'vitest';
import { initialsOf } from './contactNames';

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf('Anna Maria Svensson')).toBe('AS');
    expect(initialsOf('cher')).toBe('C');
    expect(initialsOf('  ')).toBe('?');
  });
});
