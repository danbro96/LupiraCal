import { useState, type Dispatch, type SetStateAction } from 'react';
import { createItemRelationsBatch, deleteItemRelationsBatch } from '@lupira/cal-api/query/cal';
import { deletePhoto, emptyPhotoTrash, restorePhoto, trashPhoto } from '@lupira/cal-api/query/photo';
import { PHOTO_LINK } from '@danbro96/lupira-domain-photos/photoLinks';
import { useInvalidatePhotos } from './useInvalidate';

export type Outcome = { done: number; failed: number };

/** Photo writes over one or many photos, each refreshing the gallery once when it settles. Plain
 *  fetchers, not mutation hooks: an Undo fires from a snackbar after the component that offered it
 *  has unmounted. Trash and restore are one call per photo; links go in one call per event. */
export function usePhotoActions() {
  const invalidate = useInvalidatePhotos();
  const [pending, setPending] = useState(0);

  const track = (run: () => Promise<Outcome>): Promise<Outcome> => trackPending(run, setPending, invalidate);

  const each = (ids: readonly string[], call: (id: string) => Promise<unknown>) => track(() => settleEach(ids, call));

  const once = (call: () => Promise<unknown>, count: number) => track(() =>
    call().then(() => ({ done: count, failed: 0 }), () => ({ done: 0, failed: count })));

  return {
    trash: (ids: readonly string[]) => each(ids, (id) => trashPhoto(id)),
    restore: (ids: readonly string[]) => each(ids, (id) => restorePhoto(id)),
    purge: (ids: readonly string[]) => each(ids, (id) => deletePhoto(id)),
    emptyTrash: () => once(() => emptyPhotoTrash(), 1),
    link: (itemId: string, photoIds: readonly string[]) =>
      once(() => createItemRelationsBatch(itemId, { ...PHOTO_LINK, toRefs: [...photoIds] }), photoIds.length),
    unlink: (itemId: string, photoIds: readonly string[]) =>
      once(() => deleteItemRelationsBatch(itemId, { ...PHOTO_LINK, toRefs: [...photoIds] }), photoIds.length),
    busy: pending > 0,
  };
}

async function trackPending(
  run: () => Promise<Outcome>,
  setPending: Dispatch<SetStateAction<number>>,
  invalidate: () => Promise<void>,
): Promise<Outcome> {
  setPending((n) => n + 1);
  try {
    return await run();
  } finally {
    setPending((n) => n - 1);
    void invalidate();
  }
}

async function settleEach(ids: readonly string[], call: (id: string) => Promise<unknown>): Promise<Outcome> {
  let failed = 0;
  for (const id of ids) await call(id).catch(() => { failed++; });
  return { done: ids.length - failed, failed };
}
