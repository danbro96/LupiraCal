import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ContainerDto } from '@lupira/cal-api/models';
import { isCalendarShown } from '@lupira/cal-domain/calendars';
import { readHiddenSubscriptionIds, readPref, writeHiddenSubscriptionIds, writePref } from '../../state/localPrefs';

interface Visibility {
  isVisible: (c: ContainerDto) => boolean;
  toggle: (c: ContainerDto) => void;
  tasksVisible: boolean;
  toggleTasks: () => void;
  hiddenSubscriptionIds: ReadonlySet<string>;
  toggleSubscription: (subscriptionId: string) => void;
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
 *  (LupiraTasksApi), visible by default; a subscription's feed events show unless hidden here. */
export function CalendarVisibilityProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState(readChoices);
  const [tasksVisible, setTasksVisible] = useState(() => readPref(TASKS_PREF) !== '0');
  const [hiddenSubscriptionIds, setHiddenSubscriptionIds] = useState(readHiddenSubscriptionIds);

  const isVisible = (c: ContainerDto) => isCalendarShown(c, choices);

  const toggle = (c: ContainerDto) => {
    setChoices((prev) => {
      const next = { ...prev, [c.id]: !isCalendarShown(c, prev) };
      writePref(CHOICES_PREF, JSON.stringify(next));
      return next;
    });
  };

  const toggleTasks = () => {
    setTasksVisible((v) => {
      writePref(TASKS_PREF, v ? '0' : '1');
      return !v;
    });
  };

  const toggleSubscription = (subscriptionId: string) => {
    setHiddenSubscriptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(subscriptionId)) next.delete(subscriptionId);
      else next.add(subscriptionId);
      writeHiddenSubscriptionIds(next);
      return next;
    });
  };

  const value = { isVisible, toggle, tasksVisible, toggleTasks, hiddenSubscriptionIds, toggleSubscription };
  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
}

export function useCalendarVisibility(): Visibility {
  const ctx = useContext(VisibilityContext);
  if (!ctx) throw new Error('useCalendarVisibility outside provider');
  return ctx;
}
