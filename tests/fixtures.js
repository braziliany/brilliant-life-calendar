import "../src/core.js";

const { dateKeysForMonth, SCHEMA_VERSION, TIME_ZONE } = globalThis.__PulseCalendarCore;

export function calendarFixture(overrides = {}) {
  const month = overrides.month || "2026-09";
  const days = dateKeysForMonth(month).map((date) => ({
    date,
    isWorkday: true,
    isOfficialWorkday: true,
    isHoliday: false,
    holidayName: null,
    isMakeupWorkday: false,
    hasPersonalOverride: false,
    personalOverride: null,
  }));
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
  if (month === "2026-09") {
    Object.assign(byDate["2026-09-06"], { isWorkday: false, isOfficialWorkday: false });
    Object.assign(byDate["2026-09-20"], { isMakeupWorkday: true });
    Object.assign(byDate["2026-09-25"], {
      isWorkday: false,
      isOfficialWorkday: false,
      isHoliday: true,
      holidayName: "中秋",
    });
    Object.assign(byDate["2026-09-26"], {
      isWorkday: true,
      isOfficialWorkday: false,
      isHoliday: true,
      holidayName: "中秋",
      hasPersonalOverride: true,
      personalOverride: "workday",
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    month,
    timeZone: TIME_ZONE,
    generatedAt: "2026-09-13T01:02:03.000Z",
    today: "2026-09-13",
    officialCalendarConfigured: true,
    days,
    notesSummary: {
      hasScheduleNote: true,
      hasLeaveNote: false,
      hasOvertimeNote: true,
    },
    ...overrides,
  };
}
