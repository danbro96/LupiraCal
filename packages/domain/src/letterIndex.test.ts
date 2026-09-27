import { describe, expect, it } from 'vitest';
import { indexByLetter, indexLetter, sectionFor, sectionOffsets } from './letterIndex';

describe('indexLetter', () => {
  it('keeps Å/Ä/Ö, folds other diacritics, files the rest under #', () => {
    expect(indexLetter('åsa')).toBe('Å');
    expect(indexLetter('Ärla')).toBe('Ä');
    expect(indexLetter('Östen')).toBe('Ö');
    expect(indexLetter('Émile')).toBe('E');
    expect(indexLetter('  bo')).toBe('B');
    expect(indexLetter('3M')).toBe('#');
    expect(indexLetter('')).toBe('#');
  });
});

describe('indexByLetter', () => {
  const names = ['Östen', 'anna', 'Åsa', 'Zed', 'Ärla', 'Bo', 'Adam', '42', 'Émile'];
  const { entries, headerAt } = indexByLetter(names, (n) => n);
  const flat = entries.map((e) => (e.kind === 'header' ? `[${e.letter}]` : e.item));

  it('orders sections by the Swedish alphabet with # last, names collated within', () => {
    expect(flat).toEqual(['[A]', 'Adam', 'anna', '[B]', 'Bo', '[E]', 'Émile', '[Z]', 'Zed',
      '[Å]', 'Åsa', '[Ä]', 'Ärla', '[Ö]', 'Östen', '[#]', '42']);
  });

  it('records each header position', () => {
    expect(headerAt.get('B')).toBe(3);
    expect(headerAt.get('#')).toBe(15);
    expect(headerAt.has('C')).toBe(false);
  });

  it('jumps an absent letter to the next present section, else the last', () => {
    expect(sectionFor(headerAt, 'C')).toBe(headerAt.get('E'));
    expect(sectionFor(indexByLetter(['Adam'], (n) => n).headerAt, 'X')).toBe(0);
    expect(sectionFor(new Map(), 'A')).toBeUndefined();
  });

  it('offsets each section by the headers and rows above it', () => {
    const offsets = sectionOffsets(headerAt, 10, 100);
    expect(offsets.get('A')).toBe(0);
    expect(offsets.get('B')).toBe(10 + 2 * 100);
    expect(offsets.get('#')).toBe(7 * 10 + 8 * 100);
  });
});
