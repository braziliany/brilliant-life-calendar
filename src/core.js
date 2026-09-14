(function registerPulseCalendarCore(global) {
  "use strict";

  const RELEASE_METADATA_JSON = `{"version":"0.2.0","notes":["统一日历、统计与图例的语义颜色体系","周末、跨月与 Today 叠加状态获得独立视觉层级"]}`;
  const RELEASE_METADATA = Object.freeze((() => {
    const metadata = JSON.parse(RELEASE_METADATA_JSON);
    return { ...metadata, notes: Object.freeze([...metadata.notes]) };
  })());
  const VERSION = RELEASE_METADATA.version;
  const APP_VERSION = VERSION;
  const SCHEMA_VERSION = "1.0";
  const TIME_ZONE = "Asia/Shanghai";
  const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
  const PERSONAL_OVERRIDES = new Set([null, "workday", "restday"]);

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  function isMonthKey(value) {
    return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  }

  function shanghaiDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${read("year")}-${read("month")}-${read("day")}`;
  }

  function currentShanghaiMonth(value = new Date()) {
    return shanghaiDateKey(value).slice(0, 7);
  }

  function daysInMonth(monthKey) {
    if (!isMonthKey(monthKey)) fail("INVALID_MONTH");
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function dateKeysForMonth(monthKey) {
    return Array.from(
      { length: daysInMonth(monthKey) },
      (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`,
    );
  }

  function normalizeDay(raw, expectedDate) {
    if (!isRecord(raw) || raw.date !== expectedDate) fail("INVALID_DAY_SEQUENCE");
    for (const key of [
      "isWorkday",
      "isOfficialWorkday",
      "isHoliday",
      "isMakeupWorkday",
      "hasPersonalOverride",
    ]) {
      if (typeof raw[key] !== "boolean") fail(`INVALID_DAY_${key.toUpperCase()}`);
    }
    if (!(raw.holidayName === null || typeof raw.holidayName === "string")) {
      fail("INVALID_HOLIDAY_NAME");
    }
    if (!PERSONAL_OVERRIDES.has(raw.personalOverride)) fail("INVALID_PERSONAL_OVERRIDE");
    if (raw.isHoliday !== (raw.holidayName !== null)) fail("INCONSISTENT_HOLIDAY");
    if (raw.hasPersonalOverride !== (raw.personalOverride !== null)) {
      fail("INCONSISTENT_PERSONAL_OVERRIDE");
    }
    if (raw.personalOverride === "workday" && raw.isWorkday !== true) {
      fail("INCONSISTENT_OVERRIDE_WORKDAY");
    }
    if (raw.personalOverride === "restday" && raw.isWorkday !== false) {
      fail("INCONSISTENT_OVERRIDE_RESTDAY");
    }

    return {
      date: raw.date,
      isWorkday: raw.isWorkday,
      isOfficialWorkday: raw.isOfficialWorkday,
      isHoliday: raw.isHoliday,
      holidayName: raw.holidayName,
      isMakeupWorkday: raw.isMakeupWorkday,
      hasPersonalOverride: raw.hasPersonalOverride,
      personalOverride: raw.personalOverride,
    };
  }

  function normalizeCalendarResponse(raw, expectedMonth) {
    if (!isRecord(raw)) fail("INVALID_RESPONSE");
    if (raw.schemaVersion !== SCHEMA_VERSION) fail("UNSUPPORTED_SCHEMA_VERSION");
    if (!isMonthKey(raw.month) || raw.month !== expectedMonth) fail("UNEXPECTED_MONTH");
    if (raw.timeZone !== TIME_ZONE) fail("UNEXPECTED_TIME_ZONE");
    if (!isDateKey(raw.today)) fail("INVALID_TODAY");
    if (typeof raw.generatedAt !== "string" || !Number.isFinite(Date.parse(raw.generatedAt))) {
      fail("INVALID_GENERATED_AT");
    }
    if (typeof raw.officialCalendarConfigured !== "boolean") {
      fail("INVALID_CALENDAR_CONFIGURATION_STATUS");
    }
    if (!Array.isArray(raw.days)) fail("INVALID_DAYS");

    const expectedDates = dateKeysForMonth(expectedMonth);
    if (raw.days.length !== expectedDates.length) fail("INCOMPLETE_MONTH");
    const days = raw.days.map((day, index) => normalizeDay(day, expectedDates[index]));

    if (!isRecord(raw.notesSummary)) fail("INVALID_NOTES_SUMMARY");
    const notesSummary = {};
    for (const key of ["hasScheduleNote", "hasLeaveNote", "hasOvertimeNote"]) {
      if (typeof raw.notesSummary[key] !== "boolean") fail(`INVALID_${key.toUpperCase()}`);
      notesSummary[key] = raw.notesSummary[key];
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      month: expectedMonth,
      timeZone: TIME_ZONE,
      generatedAt: raw.generatedAt,
      today: raw.today,
      officialCalendarConfigured: raw.officialCalendarConfigured,
      days,
      notesSummary,
    };
  }

  function mondayFirstOffset(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  }

  function formatShanghaiTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "--:--";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function dayVisual(day, today) {
    if (day.date === today) return "today";
    if (day.hasPersonalOverride) return day.isWorkday ? "personalWork" : "personalRest";
    if (day.isHoliday) return "holiday";
    if (day.isMakeupWorkday) return "makeup";
    return day.isWorkday ? "workday" : "restday";
  }

  function buildCalendarViewModel(calendar, options = {}) {
    const source = options.source === "cache" ? "cache" : "network";
    const now = options.now instanceof Date ? options.now : new Date();
    const localToday = shanghaiDateKey(now);
    const today = source === "network" ? calendar.today : localToday;
    const [year, month] = calendar.month.split("-").map(Number);
    const leading = Array.from({ length: mondayFirstOffset(calendar.month) }, () => null);
    const cells = [
      ...leading,
      ...calendar.days.map((day) => ({
        date: day.date,
        number: Number(day.date.slice(-2)),
        isToday: day.date === today,
        visual: dayVisual(day, today),
        holidayName: day.holidayName,
        isWorkday: day.isWorkday,
        isOfficialWorkday: day.isOfficialWorkday,
        isHoliday: day.isHoliday,
        isMakeupWorkday: day.isMakeupWorkday,
        hasPersonalOverride: day.hasPersonalOverride,
        personalOverride: day.personalOverride,
      })),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const notes = [
      calendar.notesSummary.hasScheduleNote ? "排班" : null,
      calendar.notesSummary.hasLeaveNote ? "请假" : null,
      calendar.notesSummary.hasOvertimeNote ? "加班" : null,
    ].filter(Boolean);
    const timestamp = options.successfulFetchedAt || calendar.generatedAt;

    return {
      appVersion: APP_VERSION,
      month: calendar.month,
      title: `${year}年${month}月`,
      timeZone: TIME_ZONE,
      officialCalendarConfigured: calendar.officialCalendarConfigured,
      weekdayLabels: [...WEEKDAY_LABELS],
      grid: Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7)),
      notes,
      summary: {
        workdays: calendar.days.filter((day) => day.isWorkday).length,
        restdays: calendar.days.filter((day) => !day.isWorkday).length,
        holidays: calendar.days.filter((day) => day.isHoliday).length,
        makeupWorkdays: calendar.days.filter((day) => day.isMakeupWorkday).length,
        personalOverrides: calendar.days.filter((day) => day.hasPersonalOverride).length,
      },
      freshness: {
        source,
        stale: source === "cache",
        timestamp,
        text: `${source === "cache" ? "缓存" : "更新于"} ${formatShanghaiTime(timestamp)}`,
      },
      serverToday: calendar.today,
      displayToday: today,
    };
  }

  global.__PulseCalendarCore = {
    RELEASE_METADATA_JSON,
    RELEASE_METADATA,
    VERSION,
    APP_VERSION,
    SCHEMA_VERSION,
    TIME_ZONE,
    WEEKDAY_LABELS,
    isDateKey,
    isMonthKey,
    shanghaiDateKey,
    currentShanghaiMonth,
    daysInMonth,
    dateKeysForMonth,
    normalizeCalendarResponse,
    mondayFirstOffset,
    formatShanghaiTime,
    dayVisual,
    buildCalendarViewModel,
  };
})(globalThis);
