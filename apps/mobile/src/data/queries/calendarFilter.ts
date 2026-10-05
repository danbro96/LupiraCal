/** What the grids and search show: items accepted into a shown calendar, and birthdays when theirs is shown. */
export type CalendarFilter = { calendarIds: string[]; birthdays: boolean };

export const inShownCalendars = (itemId: string) => `EXISTS (
         SELECT 1 FROM item_calendars icf
         WHERE icf.item_id = ${itemId} AND icf.status = 'Accepted'
           AND icf.calendar_id IN (SELECT value FROM json_each(?)))`;

export const preferredCalendar = (itemId: string) => `(SELECT ic.calendar_id FROM item_calendars ic WHERE ic.item_id = ${itemId}
             ORDER BY CASE ic.status WHEN 'Accepted' THEN 0 ELSE 1 END, ic.calendar_id LIMIT 1)`;
