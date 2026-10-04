// Small wording helpers every screen needs, so a count reads the same everywhere.

/** "1 photo", "3 photos"; `many` for the irregular ones. */
export function plural(n: number, noun: string, many = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : many}`;
}
