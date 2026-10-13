import { describe, expect, it } from 'vitest';
import { notificationSig, planNotifications, SCHEDULE_CAP, type DesiredNotification } from './notificationPlan';

const now = new Date('2026-10-13T12:00:00Z');
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const n = (id: string, fireAt: string, title = 'T'): DesiredNotification => ({ id, fireAt, channel: 'reminders', title, body: '', data: { url: 'lupiracalendar://' } });
const held = (d: DesiredNotification) => ({ id: d.id, sig: notificationSig(d) });

describe('planNotifications', () => {
  it('schedules what is new, leaves what is unchanged, and cancels what is no longer wanted', () => {
    const same = n('cal:rem:a', at(1));
    const plan = planNotifications([same, n('cal:rem:b', at(2))], [held(same), { id: 'cal:rem:gone', sig: 'x' }], { now });
    expect(plan.schedule.map((s) => s.id)).toEqual(['cal:rem:b']);
    expect(plan.cancel).toEqual(['cal:rem:gone']);
  });

  it('replaces a notification whose content or time changed', () => {
    const before = n('cal:rem:a', at(1));
    const plan = planNotifications([n('cal:rem:a', at(1), 'Renamed')], [held(before)], { now });
    expect([plan.cancel, plan.schedule.map((s) => s.title)]).toEqual([['cal:rem:a'], ['Renamed']]);
  });

  it('never touches ids it does not own and drops fires already past', () => {
    const plan = planNotifications([n('cal:rem:past', at(-1)), n('other:x', at(1))], [{ id: 'expo-default', sig: null }], { now });
    expect(plan).toEqual({ cancel: [], schedule: [] });
  });

  it('keeps the nearest under the cap', () => {
    const many = Array.from({ length: SCHEDULE_CAP + 5 }, (_, i) => n(`cal:rem:${String(i).padStart(3, '0')}`, at(SCHEDULE_CAP + 5 - i)));
    const plan = planNotifications(many, [], { now });
    expect(plan.schedule).toHaveLength(SCHEDULE_CAP);
    expect(plan.schedule[0].id).toBe(`cal:rem:${String(SCHEDULE_CAP + 4).padStart(3, '0')}`);
    expect(plan.schedule.some((s) => s.id === 'cal:rem:000')).toBe(false);
  });

  it('cancels one that fell past the cap', () => {
    const many = Array.from({ length: SCHEDULE_CAP }, (_, i) => n(`cal:rem:${i}`, at(i + 1)));
    const far = n('cal:rem:far', at(500));
    const plan = planNotifications([...many, far], [held(far)], { now });
    expect(plan.cancel).toEqual(['cal:rem:far']);
  });

  it('reschedules everything on a rebuild, and only near fires when re-arming', () => {
    const near = n('cal:rem:near', at(1));
    const far = n('cal:rem:far', at(5));
    expect(planNotifications([near, far], [held(near), held(far)], { now, rebuild: true }).schedule.map((s) => s.id)).toEqual(['cal:rem:near', 'cal:rem:far']);
    const rearm = planNotifications([near, far], [held(near), held(far)], { now, rearmBefore: new Date(at(2)) });
    expect([rearm.cancel, rearm.schedule.map((s) => s.id)]).toEqual([['cal:rem:near'], ['cal:rem:near']]);
  });

  it('keeps the first of two with one id', () => {
    const plan = planNotifications([n('cal:rem:a', at(1), 'First'), n('cal:rem:a', at(2), 'Second')], [], { now });
    expect(plan.schedule.map((s) => s.title)).toEqual(['First']);
  });
});
