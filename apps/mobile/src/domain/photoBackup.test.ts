import { describe, expect, it } from 'vitest';
import { contentTypeOf, extensionOf, isSupportedContentType } from './photoBackup';

describe('contentTypeOf', () => {
  it('derives the mime type from the extension, case-insensitively', () => {
    expect(contentTypeOf('IMG_1234.JPG', 'image')).toBe('image/jpeg');
    expect(contentTypeOf('IMG_1234.heic', 'image')).toBe('image/heic');
    expect(contentTypeOf('VID_1234.mov', 'video')).toBe('video/quicktime');
    expect(contentTypeOf('clip.mp4', 'video')).toBe('video/mp4');
  });

  it('prefers the extension over the coarse media type', () => {
    // MediaStore reports heic as mediaType "image"; only the extension distinguishes it from jpeg,
    // and the server needs the real type because the presigned PUT signs Content-Type.
    expect(contentTypeOf('IMG.heic', 'image')).not.toBe('image/jpeg');
  });

  it('falls back to the media type when the extension is unknown', () => {
    expect(contentTypeOf('screenshot', 'image')).toBe('image/jpeg');
    expect(contentTypeOf('recording.xyz', 'video')).toBe('video/mp4');
  });

  it('returns null for media the queue must not enqueue', () => {
    expect(contentTypeOf('voice-memo.m4a', 'audio')).toBeNull();
    expect(contentTypeOf('whatever', 'unknown')).toBeNull();
  });
});

describe('isSupportedContentType', () => {
  it('accepts what the API whitelists', () => {
    for (const t of ['image/jpeg', 'image/heic', 'video/mp4', 'video/quicktime']) {
      expect(isSupportedContentType(t)).toBe(true);
    }
  });

  it('rejects everything else, so no asset earns a guaranteed 422', () => {
    for (const t of ['application/pdf', 'image/svg+xml', 'audio/mpeg', '']) {
      expect(isSupportedContentType(t)).toBe(false);
    }
  });
});

describe('extensionOf', () => {
  it('maps a known type back to its first extension', () => {
    expect(extensionOf('image/jpeg')).toBe('jpg');
    expect(extensionOf('image/HEIC')).toBe('heic');
    expect(extensionOf('video/quicktime')).toBe('mov');
  });

  it('falls back by kind for an unknown type', () => {
    expect(extensionOf('video/x-unknown')).toBe('mp4');
    expect(extensionOf('application/octet-stream')).toBe('jpg');
  });
});
