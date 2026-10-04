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
} from '@danbro96/lupira-domain-core/time';
import { readPref, writePref } from '../../state/localPrefs';

export type CalendarView = 'month' | 'week' | 'day';
const VIEWS: readonly string[] = ['month', 'week', 'day'];
const isView = (v: string | null): v is CalendarView => v != null && VIEWS.includes(v);

/** URL-backed (?view, ?d) calendar view state shared by desktop and phone layouts. A view you pick is
 *  remembered per layout (`rememberAs`) and used whenever the URL names none; drilling into a day is not a
 *  pick. A 7-day week anchors on Monday; fewer days anchor on the date itself so Today is column 1. */
export function useCalendarRange({ defaultView, weekDayCount, rememberAs }: {
  defaultView: CalendarView;
  weekDayCount: number;
  rememberAs: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const memoryKey = `calendar.view.${rememberAs}`;
  const urlView = searchParams.get('view');
  const storedView = readPref(memoryKey);
  const view: CalendarView = isView(urlView) ? urlView : isView(storedView) ? storedView : defaultView;
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
    setView: (v: CalendarView) => {
      writePref(memoryKey, v);
      setParam('view', v);
    },
    setDate: (d: Date | null) => setParam('d', d ? ymd(d) : null),
    navigate,
    openDay,
  };
}
