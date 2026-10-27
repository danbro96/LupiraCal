import { getSyncHolidays } from '@lupira/cal-api/fetch/cal';
import type { HolidaySyncDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { HOLIDAY_DDL, HOLIDAY_TABLES, writeHolidayIndex } from '../../data/indexes/holidays';
import { Aggregate } from '../../domain/aggregates';

/** Read-only: holidays are computed by the server and never written from the device. */
export const holidayModule: AggregateModule<HolidaySyncDto, null, never, HolidaySyncDto> = {
  aggregate: Aggregate.holiday,
  feed: {
    fetch: () => getSyncHolidays(),
    fromWire: (h) => ({ id: h.id, state: { doc: h, guards: null } }),
  },
  index: { version: 1, tables: HOLIDAY_TABLES, ddl: HOLIDAY_DDL, write: writeHolidayIndex },
};
