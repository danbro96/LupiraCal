import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ContainerDto } from '@lupira/cal-api/models';
import { isCalendarShown } from '@lupira/cal-domain/calendars';
import { readPref, writePref } from '../../state/localPrefs';

interface Visibility {
  isVisible: (c: ContainerDto) => boolean;
  toggle: (c: ContainerDto) => void;
  tasksVisible: boolean;
  toggleTasks: () => void;
}

const VisibilityContext = createContext<Visibility | null>(null);

const CHOICES_PREF = 'calendars.shown';
const TASKS_PREF = 'calendars.tasksShown';

function readChoices(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(readPref(CHOICES_PREF) ?? '{}');
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Calendar visibility, remembered per browser. `tasksVisible` gates the task-deadline pseudo-source
 *  (LupiraTasksApi), visible by default. */
export function CalendarVisibilityProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState(readChoices);
  const [tasksVisible, setTasksVisible] = useState(() => readPref(TASKS_PREF) !== '0');

  const isVisible = useCallback((c: ContainerDto) => isCalendarShown(c, choices), [choices]);

  const toggle = useCallback((c: ContainerDto) => {
    setChoices((prev) => {
      const next = { ...prev, [c.id]: !isCalendarShown(c, prev) };
      writePref(CHOICES_PREF, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleTasks = useCallback(() => {
    setTasksVisible((v) => {
      writePref(TASKS_PREF, v ? '0' : '1');
      return !v;
    });
  }, []);

  const value = useMemo(
    () => ({ isVisible, toggle, tasksVisible, toggleTasks }),
    [isVisible, toggle, tasksVisible, toggleTasks],
  );
  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
}

export function useCalendarVisibility(): Visibility {
  const ctx = useContext(VisibilityContext);
  if (!ctx) throw new Error('useCalendarVisibility outside provider');
  return ctx;
}
