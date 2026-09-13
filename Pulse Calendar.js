// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// Pulse Calendar v0.1.0 — generated file. Edit src/* instead.

(function registerPulseCalendarCore(global) {
  "use strict";

  const APP_VERSION = "0.1.0";
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

(function registerPulseCalendarRuntime(global) {
  "use strict";

  const core = global.__PulseCalendarCore;
  const ENDPOINT = "https://pulse.sophier.org/api/v1/calendar/widget";
  const CLIENT_ID_KEY = "pulse.calendar.widget.cfAccessClientId";
  const CLIENT_SECRET_KEY = "pulse.calendar.widget.cfAccessClientSecret";
  const CACHE_SCHEMA_VERSION = "1";
  const CACHE_DIRECTORY = "pulse-calendar-widget-v1";
  const REFRESH_MINUTES = 30;
  const CALENDAR_URL = "calshow://";

  /* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
  const designTokens = Object.freeze({
    background: "0C0D12",
    primaryText: "F5F5F7",
    secondaryText: "A6A8B2",
    mutedText: "787B87",
    pulsePurple: "8B7CFF",
    holidayRed: "FF6B76",
    workCyan: "58C7D8",
    adjustedRestYellow: "F4C765",
    todayBackground: "6757CC",
    spacing: Object.freeze({
      widgetTop: 11,
      widgetHorizontal: 14,
      widgetBottom: 9,
      headerToContent: 4,
      headerToHero: 13,
      section: 9,
      largeHeaderToStats: 2,
      largeStatsToWeekday: 6,
      largeWeekdayToGrid: 4,
      largeCalendarRow: 7,
      column: 2,
      row: 1,
      legend: 5,
      hero: 11,
      detail: 2,
      smallFooter: 5,
      unavailableBody: 12,
    }),
    radius: Object.freeze({ widget: 22, today: 7, marker: 2 }),
    headerFont: Object.freeze({ size: 16, weight: "bold" }),
    calendarFont: Object.freeze({ size: 9, weight: "semibold" }),
    footerFont: Object.freeze({ size: 8, weight: "medium" }),
    weekdayFont: Object.freeze({ size: 8, weight: "medium" }),
    statusFont: Object.freeze({ size: 6, weight: "medium" }),
    pulseFont: Object.freeze({ size: 9, weight: "semibold" }),
    smallTodayFont: Object.freeze({ size: 34, weight: "bold" }),
    smallStatusFont: Object.freeze({ size: 15, weight: "semibold" }),
    smallDetailFont: Object.freeze({ size: 9, weight: "medium" }),
    mediumStatusFont: Object.freeze({ size: 5, weight: "medium" }),
    largeCalendarFont: Object.freeze({ size: 15, weight: "semibold" }),
    largeHeaderPulseFont: Object.freeze({ size: 9, weight: "semibold" }),
    largeHeaderMonthFont: Object.freeze({ size: 11, weight: "medium" }),
    largeSummaryValueFont: Object.freeze({ size: 10, weight: "semibold" }),
    largeSummaryLabelFont: Object.freeze({ size: 8, weight: "medium" }),
    largeFooterFont: Object.freeze({ size: 7, weight: "medium" }),
    unavailableBodyFont: Object.freeze({ size: 13, weight: "medium" }),
    layout: Object.freeze({
      smallPadding: Object.freeze({ top: 12, right: 12, bottom: 11, left: 12 }),
      mediumPadding: Object.freeze({ top: 9, right: 14, bottom: 8, left: 14 }),
      largePadding: Object.freeze({ top: 10, right: 14, bottom: 9, left: 14 }),
      unavailablePadding: Object.freeze({ top: 16, right: 16, bottom: 14, left: 16 }),
      weekdayWidth: 38,
      weekdayHeight: 10,
      mediumCellWidth: 38,
      mediumCellHeight: 14,
      largeCellWidth: 41,
      largeCellHeight: 36,
      largeDateWidth: 24,
      largeDateHeight: 20,
      largeMarkerHeight: 7,
      largeMarkerSize: 3,
      todayBorderWidth: 1,
    }),
  });

  function safeErrorCode(error, fallback = "UNKNOWN") {
    const candidate = error?.code || error?.message;
    return typeof candidate === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate)
      ? candidate
      : fallback;
  }

  function cachePath(month) {
    const fm = FileManager.local();
    const directory = fm.joinPath(fm.documentsDirectory(), CACHE_DIRECTORY);
    if (!fm.fileExists(directory)) fm.createDirectory(directory, true);
    return fm.joinPath(directory, `${month}.json`);
  }

  function readCredentials() {
    if (!Keychain.contains(CLIENT_ID_KEY) || !Keychain.contains(CLIENT_SECRET_KEY)) return null;
    const clientId = Keychain.get(CLIENT_ID_KEY).trim();
    const clientSecret = Keychain.get(CLIENT_SECRET_KEY).trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  async function configureCredentials() {
    const existing = readCredentials();
    const alert = new Alert();
    alert.title = "Pulse Calendar 认证";
    alert.message = "凭据只保存到 Scriptable Keychain，不会写入脚本、缓存或日志。";
    alert.addTextField("CF-Access-Client-Id", existing?.clientId || "");
    alert.addSecureTextField("CF-Access-Client-Secret", "");
    alert.addAction("保存");
    alert.addCancelAction("取消");
    if ((await alert.presentAlert()) === -1) return existing;

    const clientId = String(alert.textFieldValue(0) || "").trim();
    const clientSecret = String(alert.textFieldValue(1) || "").trim();
    if (!clientId || !clientSecret) throw new Error("CREDENTIALS_REQUIRED");
    Keychain.set(CLIENT_ID_KEY, clientId);
    Keychain.set(CLIENT_SECRET_KEY, clientSecret);
    return { clientId, clientSecret };
  }

  async function credentialsForRun() {
    const existing = readCredentials();
    if (typeof config === "undefined" || !config.runsInApp) return existing;
    if (!existing) return configureCredentials();

    const alert = new Alert();
    alert.title = "Pulse Calendar";
    alert.message = "认证已保存在 Keychain。可直接预览，或更新认证。";
    alert.addAction("预览组件");
    alert.addAction("更新认证");
    alert.addCancelAction("取消");
    const selection = await alert.presentAlert();
    if (selection === 1) return configureCredentials();
    return existing;
  }

  async function fetchCalendar(month, credentials) {
    const request = new Request(`${ENDPOINT}?month=${encodeURIComponent(month)}`);
    request.method = "GET";
    request.timeoutInterval = 12;
    request.headers = {
      "CF-Access-Client-Id": credentials.clientId,
      "CF-Access-Client-Secret": credentials.clientSecret,
      Accept: "application/json",
    };
    const body = await request.loadString();
    const status = Number(request.response?.statusCode || 0);
    if (status !== 200) throw new Error(`HTTP_${status || "UNKNOWN"}`);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error("INVALID_JSON");
    }
    return core.normalizeCalendarResponse(payload, month);
  }

  function readCache(month) {
    try {
      const fm = FileManager.local();
      const path = cachePath(month);
      if (!fm.fileExists(path)) return null;
      const envelope = JSON.parse(fm.readString(path));
      if (envelope.cacheSchemaVersion !== CACHE_SCHEMA_VERSION) return null;
      const calendar = core.normalizeCalendarResponse(envelope.calendar, month);
      if (typeof envelope.successfulFetchedAt !== "string") return null;
      return { calendar, successfulFetchedAt: envelope.successfulFetchedAt };
    } catch {
      return null;
    }
  }

  function writeCache(month, calendar, successfulFetchedAt) {
    const envelope = {
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      successfulFetchedAt,
      calendar,
    };
    FileManager.local().writeString(cachePath(month), JSON.stringify(envelope));
  }

  async function loadCalendar(month, credentials, now = new Date()) {
    if (credentials) {
      try {
        const calendar = await fetchCalendar(month, credentials);
        const successfulFetchedAt = now.toISOString();
        writeCache(month, calendar, successfulFetchedAt);
        return { calendar, source: "network", successfulFetchedAt };
      } catch (error) {
        console.warn(`[Pulse Calendar] fetch failed: ${safeErrorCode(error, "NETWORK_ERROR")}`);
      }
    }

    const cached = readCache(month);
    if (cached) return { ...cached, source: "cache" };
    throw new Error(credentials ? "CALENDAR_UNAVAILABLE" : "CREDENTIALS_REQUIRED");
  }

  function colorToken(name, alpha = 1) {
    return new Color(designTokens[name], alpha);
  }

  function tokenFont(token, size = token.size) {
    if (token.weight === "bold") return Font.boldSystemFont(size);
    if (token.weight === "semibold") return Font.semiboldSystemFont(size);
    return Font.mediumSystemFont(size);
  }

  function addText(stack, value, fontToken, tone, centered = false) {
    const text = stack.addText(String(value));
    text.font = tokenFont(fontToken);
    text.textColor = colorToken(tone);
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.6;
    if (centered) text.centerAlignText();
    return text;
  }

  function setWidgetBase(widget, padding) {
    widget.setPadding(padding.top, padding.right, padding.bottom, padding.left);
    widget.backgroundColor = colorToken("background");
    widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
    widget.url = CALENDAR_URL;
  }

  function statusLabel(cell, full = false) {
    if (cell.personalOverride === "restday") return "改休";
    if (cell.personalOverride === "workday") return "改班";
    if (cell.isHoliday) return cell.holidayName || "假";
    if (cell.isMakeupWorkday) return full ? "调班" : "班";
    return cell.isWorkday ? "" : "休";
  }

  function dayTone(cell) {
    if (cell.isToday) return "primaryText";
    if (cell.personalOverride === "restday") return "adjustedRestYellow";
    if (cell.personalOverride === "workday") return "workCyan";
    if (cell.isHoliday) return "holidayRed";
    if (cell.isMakeupWorkday) return "workCyan";
    return cell.isWorkday ? "primaryText" : "mutedText";
  }

  function addHeader(widget, vm) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    addText(row, vm.title, designTokens.headerFont, "primaryText");
    row.addSpacer();
    const mark = addText(row, "PULSE", designTokens.pulseFont, "pulsePurple");
    mark.minimumScaleFactor = 1;
  }

  function addWeekdayHeader(widget, vm, width) {
    const row = widget.addStack();
    row.layoutHorizontally();
    vm.weekdayLabels.forEach((label, index) => {
      const cell = row.addStack();
      cell.size = new Size(width, designTokens.layout.weekdayHeight);
      cell.layoutHorizontally();
      cell.addSpacer();
      addText(cell, label, designTokens.weekdayFont, "mutedText", true);
      cell.addSpacer();
      if (index < 6) row.addSpacer(designTokens.spacing.column);
    });
  }

  function addCalendarGrid(widget, vm, profile) {
    vm.grid.forEach((week, weekIndex) => {
      const row = widget.addStack();
      row.layoutHorizontally();
      week.forEach((cell, index) => {
        const box = row.addStack();
        box.size = new Size(profile.cellWidth, profile.cellHeight);
        box.layoutVertically();
        box.centerAlignContent();
        if (cell?.isToday) {
          box.backgroundColor = colorToken("todayBackground");
          box.cornerRadius = designTokens.radius.today;
        }
        if (cell) {
          addText(box, cell.number, profile.calendarFont, dayTone(cell), true);
          const label = statusLabel(cell);
          if (label) {
            addText(box, label, profile.statusFont, cell.isToday ? "primaryText" : dayTone(cell), true);
          }
        }
        if (index < 6) row.addSpacer(designTokens.spacing.column);
      });
      if (weekIndex < vm.grid.length - 1) widget.addSpacer(profile.rowGap);
    });
  }

  function addFooter(widget, vm) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const legend = [
      ["假", "holidayRed"],
      ["休", "mutedText"],
      ["班", "workCyan"],
      ["改", "adjustedRestYellow"],
    ];
    legend.forEach(([label, tone], index) => {
      addText(row, label, designTokens.footerFont, tone);
      if (index < legend.length - 1) row.addSpacer(designTokens.spacing.legend);
    });
    row.addSpacer();
    addText(
      row,
      vm.freshness.text,
      designTokens.footerFont,
      vm.freshness.stale ? "adjustedRestYellow" : "mutedText",
    );
  }

  function addLargeHeader(widget, vm) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const mark = addText(row, "PULSE", designTokens.largeHeaderPulseFont, "pulsePurple");
    mark.minimumScaleFactor = 1;
    row.addSpacer();
    addText(row, vm.title, designTokens.largeHeaderMonthFont, "secondaryText");
  }

  function addLargeSummary(widget, vm) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const items = [
      [vm.summary.workdays, "工作", "primaryText"],
      [vm.summary.restdays, "休息", "mutedText"],
      [vm.summary.holidays, "节日", "holidayRed"],
      [vm.summary.makeupWorkdays, "调班", "workCyan"],
      [vm.summary.personalOverrides, "个人", "adjustedRestYellow"],
    ];
    items.forEach(([value, label, tone], index) => {
      const item = row.addStack();
      item.layoutHorizontally();
      item.centerAlignContent();
      addText(item, value, designTokens.largeSummaryValueFont, tone);
      item.addSpacer(designTokens.spacing.detail);
      addText(item, label, designTokens.largeSummaryLabelFont, "mutedText");
      if (index < items.length - 1) row.addSpacer();
    });
  }

  function largeStateTone(cell) {
    if (cell.isAdjacentMonth) return "mutedText";
    if (cell.hasPersonalOverride) return "adjustedRestYellow";
    if (cell.isHoliday) return "holidayRed";
    if (cell.isMakeupWorkday) return "workCyan";
    return cell.isWorkday ? "primaryText" : "mutedText";
  }

  function largeMarker(cell) {
    if (cell.isAdjacentMonth) return null;
    if (cell.hasPersonalOverride) return { type: "dot", tone: "adjustedRestYellow", label: "" };
    if (cell.isHoliday && cell.largeHolidayLabel) {
      return { type: "label", tone: "holidayRed", label: cell.largeHolidayLabel };
    }
    if (cell.isMakeupWorkday) return { type: "dot", tone: "workCyan", label: "" };
    return null;
  }

  function utcDateKey(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function largeCalendarWeeks(vm) {
    const [year, month] = vm.month.split("-").map(Number);
    const leading = core.mondayFirstOffset(vm.month);
    const currentCells = new Map(calendarCells(vm).map((cell) => [cell.date, cell]));
    let previousHolidayName = null;
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1, 1 - leading + index));
      const dateKey = utcDateKey(date);
      const current = currentCells.get(dateKey);
      if (!current) {
        previousHolidayName = null;
        return {
          date: dateKey,
          number: date.getUTCDate(),
          isAdjacentMonth: true,
          isToday: false,
        };
      }
      const holidayName = current.isHoliday ? current.holidayName || "节日" : null;
      const largeHolidayLabel = (
        holidayName
        && !current.hasPersonalOverride
        && holidayName !== previousHolidayName
      ) ? holidayName : null;
      previousHolidayName = holidayName;
      return { ...current, isAdjacentMonth: false, largeHolidayLabel };
    });
    return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  }

  function addLargeCalendarGrid(widget, vm) {
    const weeks = largeCalendarWeeks(vm);
    weeks.forEach((week, weekIndex) => {
      const row = widget.addStack();
      row.layoutHorizontally();
      week.forEach((cell, index) => {
        const box = row.addStack();
        box.size = new Size(designTokens.layout.largeCellWidth, designTokens.layout.largeCellHeight);
        box.layoutVertically();
        box.centerAlignContent();
        box.addSpacer();
        const dateRow = box.addStack();
        dateRow.size = new Size(designTokens.layout.largeCellWidth, designTokens.layout.largeDateHeight);
        dateRow.layoutHorizontally();
        dateRow.centerAlignContent();
        dateRow.addSpacer();
        const dateBox = dateRow.addStack();
        dateBox.size = new Size(designTokens.layout.largeDateWidth, designTokens.layout.largeDateHeight);
        dateBox.layoutHorizontally();
        dateBox.centerAlignContent();
        if (cell.isToday) {
          dateBox.borderWidth = designTokens.layout.todayBorderWidth;
          dateBox.borderColor = colorToken("pulsePurple");
          dateBox.cornerRadius = designTokens.radius.today;
        }
        dateBox.addSpacer();
        addText(
          dateBox,
          cell.number,
          designTokens.largeCalendarFont,
          cell.isToday ? "primaryText" : largeStateTone(cell),
          true,
        );
        dateBox.addSpacer();
        dateRow.addSpacer();
        const markerRow = box.addStack();
        markerRow.size = new Size(designTokens.layout.largeCellWidth, designTokens.layout.largeMarkerHeight);
        markerRow.layoutHorizontally();
        markerRow.centerAlignContent();
        markerRow.addSpacer();
        const marker = largeMarker(cell);
        if (marker?.type === "label") {
          addText(markerRow, marker.label, designTokens.statusFont, marker.tone, true);
        } else if (marker?.type === "dot") {
          const dot = markerRow.addStack();
          dot.size = new Size(designTokens.layout.largeMarkerSize, designTokens.layout.largeMarkerSize);
          dot.backgroundColor = colorToken(marker.tone);
          dot.cornerRadius = designTokens.radius.marker;
        }
        markerRow.addSpacer();
        box.addSpacer();
        if (index < 6) row.addSpacer(designTokens.spacing.column);
      });
      if (weekIndex < weeks.length - 1) widget.addSpacer(designTokens.spacing.largeCalendarRow);
    });
  }

  function addLargeFooter(widget, vm) {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const legend = [
      ["假", "holidayRed"],
      ["休", "mutedText"],
      ["班", "workCyan"],
      ["改", "adjustedRestYellow"],
    ];
    legend.forEach(([label, tone], index) => {
      addText(row, label, designTokens.largeFooterFont, tone);
      if (index < legend.length - 1) row.addSpacer(designTokens.spacing.legend);
    });
    row.addSpacer();
    addText(
      row,
      vm.freshness.text,
      designTokens.largeFooterFont,
      vm.freshness.stale ? "adjustedRestYellow" : "mutedText",
    );
  }

  function calendarCells(vm) {
    return vm.grid.flat().filter(Boolean);
  }

  function smallToday(vm) {
    return calendarCells(vm).find((cell) => cell.isToday) || null;
  }

  function smallDetail(cell) {
    if (!cell) return { title: "今日不在本月", subtitle: "查看月历", tone: "secondaryText" };
    const label = statusLabel(cell, true);
    return {
      title: label || "工作日",
      subtitle: `${Number(cell.date.slice(5, 7))}月${cell.number}日`,
      tone: dayTone(cell),
    };
  }

  function smallNextLine(vm, today) {
    const important = calendarCells(vm).find((cell) => (
      (!today || cell.date > today.date)
      && (cell.isHoliday || cell.isMakeupWorkday || cell.hasPersonalOverride)
    ));
    if (!important) return `本月 ${vm.summary.workdays} 工作 · ${vm.summary.restdays} 休息`;
    const label = statusLabel(important, true);
    return `下一项 ${Number(important.date.slice(5, 7))}月${important.number}日 · ${label}`;
  }

  function renderMedium(vm) {
    const widget = new ListWidget();
    setWidgetBase(widget, designTokens.layout.mediumPadding);
    addHeader(widget, vm);
    widget.addSpacer(designTokens.spacing.headerToContent);
    addWeekdayHeader(widget, vm, designTokens.layout.weekdayWidth);
    widget.addSpacer(designTokens.spacing.row);
    addCalendarGrid(widget, vm, {
      cellWidth: designTokens.layout.mediumCellWidth,
      cellHeight: designTokens.layout.mediumCellHeight,
      calendarFont: designTokens.calendarFont,
      statusFont: designTokens.mediumStatusFont,
      rowGap: designTokens.spacing.row,
    });
    widget.addSpacer();
    addFooter(widget, vm);
    return widget;
  }

  function renderSmall(vm) {
    const widget = new ListWidget();
    setWidgetBase(widget, designTokens.layout.smallPadding);
    addHeader(widget, vm);
    widget.addSpacer(designTokens.spacing.headerToHero);
    const today = smallToday(vm);
    const detail = smallDetail(today);
    const hero = widget.addStack();
    hero.layoutHorizontally();
    hero.centerAlignContent();
    addText(hero, today ? today.number : "—", designTokens.smallTodayFont, today ? dayTone(today) : "mutedText");
    hero.addSpacer(designTokens.spacing.hero);
    const context = hero.addStack();
    context.layoutVertically();
    addText(context, detail.title, designTokens.smallStatusFont, detail.tone);
    context.addSpacer(designTokens.spacing.detail);
    addText(context, detail.subtitle, designTokens.smallDetailFont, "secondaryText");
    widget.addSpacer();
    addText(widget, smallNextLine(vm, today), designTokens.smallDetailFont, "secondaryText");
    widget.addSpacer(designTokens.spacing.smallFooter);
    addText(
      widget,
      vm.freshness.text,
      designTokens.footerFont,
      vm.freshness.stale ? "adjustedRestYellow" : "mutedText",
    );
    return widget;
  }

  function renderLarge(vm) {
    const widget = new ListWidget();
    setWidgetBase(widget, designTokens.layout.largePadding);
    addLargeHeader(widget, vm);
    widget.addSpacer(designTokens.spacing.largeHeaderToStats);
    addLargeSummary(widget, vm);
    widget.addSpacer(designTokens.spacing.largeStatsToWeekday);
    addWeekdayHeader(widget, vm, designTokens.layout.largeCellWidth);
    widget.addSpacer(designTokens.spacing.largeWeekdayToGrid);
    addLargeCalendarGrid(widget, vm);
    widget.addSpacer();
    addLargeFooter(widget, vm);
    return widget;
  }

  function renderForFamily(family, vm) {
    if (family === "small") return renderSmall(vm);
    if (family === "large") return renderLarge(vm);
    return renderMedium(vm);
  }

  function renderUnavailable(message = "暂时无法读取日历") {
    const widget = new ListWidget();
    const padding = designTokens.layout.unavailablePadding;
    widget.setPadding(padding.top, padding.right, padding.bottom, padding.left);
    widget.backgroundColor = colorToken("background");
    widget.url = CALENDAR_URL;
    const title = widget.addText("Pulse Calendar");
    title.font = tokenFont(designTokens.headerFont);
    title.textColor = colorToken("primaryText");
    widget.addSpacer(designTokens.spacing.unavailableBody);
    const text = widget.addText(message);
    text.font = tokenFont(designTokens.unavailableBodyFont);
    text.textColor = colorToken("secondaryText");
    text.lineLimit = 3;
    widget.addSpacer();
    const hint = widget.addText("在 Scriptable App 中运行脚本以配置认证");
    hint.font = tokenFont(designTokens.smallDetailFont);
    hint.textColor = colorToken("mutedText");
    hint.lineLimit = 2;
    return widget;
  }

  async function buildWidget(family, now = new Date()) {
    const month = core.currentShanghaiMonth(now);
    const credentials = await credentialsForRun();
    const loaded = await loadCalendar(month, credentials, now);
    const vm = core.buildCalendarViewModel(loaded.calendar, { ...loaded, now });
    const resolvedFamily = ["small", "medium", "large"].includes(family) ? family : "medium";
    return { widget: renderForFamily(resolvedFamily, vm), vm, family: resolvedFamily };
  }

  async function main() {
    const requestedFamily = String(
      typeof config !== "undefined" ? config.widgetFamily || "medium" : "medium",
    ).toLowerCase();
    let result;
    try {
      result = await buildWidget(requestedFamily);
    } catch (error) {
      console.warn(`[Pulse Calendar] unavailable: ${safeErrorCode(error)}`);
      result = { widget: renderUnavailable(), family: requestedFamily };
    }

    Script.setWidget(result.widget);
    if (typeof config === "undefined" || !config.runsInWidget) {
      if (result.family === "small") await result.widget.presentSmall();
      else if (result.family === "large") await result.widget.presentLarge();
      else await result.widget.presentMedium();
    }
    Script.complete();
  }

  global.__PulseCalendarRuntime = {
    ENDPOINT,
    CALENDAR_URL,
    CLIENT_ID_KEY,
    CLIENT_SECRET_KEY,
    CACHE_SCHEMA_VERSION,
    designTokens,
    safeErrorCode,
    readCredentials,
    configureCredentials,
    credentialsForRun,
    fetchCalendar,
    loadCalendar,
    renderSmall,
    renderMedium,
    renderLarge,
    renderForFamily,
    renderUnavailable,
    buildWidget,
    main,
  };
})(globalThis);

await globalThis.__PulseCalendarRuntime.main();
