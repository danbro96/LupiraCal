import type { PhotoListItemDto } from '@lupira/cal-api/models';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from './mirror';

/** The newest page of the unfiltered library, so an offline launch still has a grid — photos are
 *  otherwise network-only. The thumbnails themselves come from the image disk cache. */

const SNAPSHOT_KEY = 'photos.snapshot';

export async function loadPhotoSnapshot(db: Db): Promise<PhotoListItemDto[]> {
  const stored = await getMeta(db, SNAPSHOT_KEY);
  return stored ? (JSON.parse(stored) as PhotoListItemDto[]) : [];
}

export async function savePhotoSnapshot(db: Db, items: readonly PhotoListItemDto[]): Promise<void> {
  await db.exclusive((tx) => setMeta(tx, SNAPSHOT_KEY, JSON.stringify(items)));
}
