/** Image disk-cache keys by asset, not URL: presigned URLs change signature on every fetch. */
export const thumbCacheKey = (photoId: string) => `photo-thumb:${photoId}`;
export const originalCacheKey = (photoId: string) => `photo-original:${photoId}`;
