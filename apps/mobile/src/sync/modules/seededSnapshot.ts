import type { FeedPage } from '@danbro96/lupira-sync-engine/types';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

/** The app may be a member's first client: seed their standard containers when missing, then refetch. A failed
 *  seed must not hold back the mirror; the next sync retries. */
export async function seededSnapshot<T>(
  fetch: () => Promise<FeedPage<T>>, needsSeed: (docs: T[]) => boolean, seed: () => Promise<unknown>, what: string,
): Promise<FeedPage<T>> {
  const page = await fetch();
  if (!needsSeed(page.changed)) return page;
  try {
    await seed();
  } catch (e) {
    logDebug('sync', `${what} bootstrap failed: ${String(e)}`);
    return page;
  }
  return fetch();
}
