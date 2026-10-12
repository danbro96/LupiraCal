import { describe, expect, it } from 'vitest';
import { channelLabel, reachAppLink, reachLink } from './reach';

describe('reachLink', () => {
  it('builds each kind’s deep link', () => {
    expect(reachLink('Phone', '+46 70 123')).toBe('tel:+46 70 123');
    expect(reachLink('Telegram', '@danbro')).toBe('https://t.me/danbro');
    expect(reachLink('WhatsApp', '+46 70-123')).toBe('https://wa.me/4670123');
    expect(reachLink('Web', 'lupira.com')).toBe('https://lupira.com');
  });

  it('gives nothing to open for an unknown kind that isn’t a URL', () => {
    expect(reachLink('Mastodon', '@me@example.social')).toBeNull();
    expect(reachLink('Email', '  ')).toBeNull();
  });
});

describe('reachAppLink', () => {
  it('opens Telegram in its app', () => {
    expect(reachAppLink('Telegram', '@danbro')).toBe('tg://resolve?domain=danbro');
  });

  it('has no app scheme for other kinds', () => {
    expect(reachAppLink('Phone', '+46 70 123')).toBeNull();
    expect(reachAppLink('Telegram', ' ')).toBeNull();
  });
});

describe('channelLabel', () => {
  it('adds the type when there is one', () => {
    expect(channelLabel('Phone', 'Mobile')).toBe('Phone (Mobile)');
    expect(channelLabel('Email', null)).toBe('Email');
  });
});
