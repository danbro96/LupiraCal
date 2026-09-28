import { deletePhoto, emptyPhotoTrash, restorePhoto, trashPhoto } from '@lupira/cal-api/fetch/photo';
import { invalidatePhotos } from '../sync/reactivity';

export type Outcome = { done: number; failed: number };

/** One call per photo — the photo API has no batch form — and one gallery refresh when all settle. */
async function each(ids: readonly string[], call: (id: string) => Promise<{ status: number }>, okStatus: number): Promise<Outcome> {
  let failed = 0;
  for (const id of ids) {
    const r = await call(id).catch(() => null);
    if (r?.status !== okStatus) failed++;
  }
  invalidatePhotos();
  return { done: ids.length - failed, failed };
}

export const trashPhotos = (ids: readonly string[]) => each(ids, trashPhoto, 200);
export const restorePhotos = (ids: readonly string[]) => each(ids, restorePhoto, 200);
export const purgePhotos = (ids: readonly string[]) => each(ids, deletePhoto, 204);

export async function emptyTrash(): Promise<boolean> {
  const r = await emptyPhotoTrash().catch(() => null);
  invalidatePhotos();
  return r?.status === 204;
}
