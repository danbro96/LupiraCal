import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

export type SubscribedOccurrence = {
  event_id: string;
  subscription_id: string;
  calendar_id: string;
  start_utc: string;
  end_utc: string | null;
  all_day: number;
  title: string;
  location: string | null;
  color: string | null;
  status: string;
};

/** The occurrence of a subscribed event starting at `startUtc`, else its first one. */
export async function subscribedOccurrence(tx: Tx, eventId: string, startUtc: string): Promise<SubscribedOccurrence | null> {
  return tx.first<SubscribedOccurrence>(
    `SELECT event_id, subscription_id, calendar_id, start_utc, end_utc, all_day, title, location, color, status
     FROM subscribed_occurrences WHERE event_id = ?
     ORDER BY CASE WHEN start_utc = ? THEN 0 ELSE 1 END, start_utc LIMIT 1`,
    [eventId, startUtc],
  );
}
