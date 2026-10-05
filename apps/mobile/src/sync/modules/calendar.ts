import { bootstrapMe, getSyncCalendars } from '@lupira/cal-api/fetch/cal';
import type { ContainerDto } from '@lupira/cal-api/models';
import { needsCalendarBootstrap } from '@lupira/cal-domain/bootstrap';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { CALENDAR_DDL, CALENDAR_TABLES, writeCalendarIndex } from '../../data/indexes/calendars';
import { Aggregate } from '../../domain/aggregates';
import { seededSnapshot } from './seededSnapshot';

/** What the stock Calendar app gets; MirrorReader.kt reads these columns. */
const BRIDGE_VIEW = `
  DROP VIEW IF EXISTS bridge_calendars;
  CREATE VIEW bridge_calendars AS SELECT id, local AS state FROM docs WHERE aggregate = '${Aggregate.calendar}' AND local IS NOT NULL;
`;

export const calendarModule: AggregateModule<ContainerDto, null, never, ContainerDto> = {
  aggregate: Aggregate.calendar,
  feed: {
    fetch: () => seededSnapshot(getSyncCalendars, needsCalendarBootstrap, () => bootstrapMe(), 'calendars'),
    fromWire: (c) => ({ id: c.id, state: { doc: c, guards: null } }),
  },
  index: { version: 1, tables: CALENDAR_TABLES, ddl: CALENDAR_DDL + BRIDGE_VIEW, write: writeCalendarIndex },
};
