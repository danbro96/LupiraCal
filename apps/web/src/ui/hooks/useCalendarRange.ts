import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addDays,
  addMonths,
  daysFrom,
  fmtDayTitle,
  fmtMonthTitle,
  fmtWeekRange,
  monthMatrix,
  parseYmd,
  startOfDay,
  startOfWeek,
  ymd,
} from '@lupira/cal-domain/time';

export type CalendarView = 'month' | 'week' | 'day';

/** URL-backed (?view, ?d) calendar view state shared by desktop and phone layouts.
 *  A 7-day week anchors on Monday; fewer days anchor on the date itself so Today is column 1. */
export function useCalendarRange({ defaultView, weekDayCount }: { defaultView: CalendarView; weekDayCount: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') as CalendarView) ?? defaultView;
  const dateParam = searchParams.get('d');
  // Midnight-normalized: day/3-day ranges start at the day boundary, not the current instant.
  const date = useMemo(() => (dateParam ? parseYmd(dateParam) : startOfDay(new Date())), [dateParam]);

  const setParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const weeks = useMemo(() => monthMatrix(date), [date]);
  const days = useMemo(() => {
    if (view === 'month') return weeks.flat();
    if (view === 'week') return weekDayCount === 7 ? daysFrom(startOfWeek(date), 7) : daysFrom(date, weekDayCount);
    return [date];
  }, [view, date, weeks, weekDayCount]);
  const range = useMemo(() => ({ start: days[0], end: addDays(days[days.length - 1], 1) }), [days]);

  const navigate = (dir: -1 | 1) => {
    const next = view === 'month' ? addMonths(date, dir) : addDays(date, dir * (view === 'week' ? weekDayCount : 1));
    setParam('d', ymd(next));
  };
  const openDay = (d: Date) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'day');
      next.set('d', ymd(d));
      return next;
    });
  };

  const title =
    view === 'month'
      ? fmtMonthTitle(date)
      : view === 'week'
        ? fmtWeekRange(days[0], days[days.length - 1])
        : fmtDayTitle(date);

  return {
    view,
    date,
    weeks,
    days,
    range,
    title,
    setView: (v: CalendarView) => setParam('view', v),
    setDate: (d: Date | null) => setParam('d', d ? ymd(d) : null),
    navigate,
    openDay,
  };
}
