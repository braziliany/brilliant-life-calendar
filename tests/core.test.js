import assert from "node:assert/strict";
import test from "node:test";
import "../src/core.js";
import { calendarFixture } from "./fixtures.js";

const core = globalThis.__PulseCalendarCore;

test("Shanghai date owns month selection across the UTC boundary", () => {
  const now = new Date("2026-09-12T16:30:00.000Z");
  assert.equal(core.shanghaiDateKey(now), "2026-09-13");
  assert.equal(core.currentShanghaiMonth(now), "2026-09");
});

test("normalizer accepts the frozen production contract and copies explicit facts", () => {
  const normalized = core.normalizeCalendarResponse(calendarFixture(), "2026-09");
  assert.equal(normalized.schemaVersion, "1.0");
  assert.equal(normalized.days.length, 30);
  assert.equal(normalized.days[24].holidayName, "中秋");
  assert.equal(normalized.days[25].personalOverride, "workday");
  assert.deepEqual(normalized.notesSummary, {
    hasScheduleNote: true,
    hasLeaveNote: false,
    hasOvertimeNote: true,
  });
});

test("normalizer rejects schema, month, timezone, completeness and sequence drift", () => {
  const cases = [
    [calendarFixture({ schemaVersion: "2.0" }), "UNSUPPORTED_SCHEMA_VERSION"],
    [calendarFixture({ month: "2026-10" }), "UNEXPECTED_MONTH"],
    [calendarFixture({ timeZone: "UTC" }), "UNEXPECTED_TIME_ZONE"],
    [calendarFixture({ days: calendarFixture().days.slice(1) }), "INCOMPLETE_MONTH"],
    [
      calendarFixture({
        days: calendarFixture().days.map((day, index) => (
          index === 1 ? { ...day, date: "2026-09-03" } : day
        )),
      }),
      "INVALID_DAY_SEQUENCE",
    ],
  ];
  for (const [payload, code] of cases) {
    assert.throws(() => core.normalizeCalendarResponse(payload, "2026-09"), { message: code });
  }
});

test("normalizer preserves no override versus explicit workday/restday", () => {
  const fixture = calendarFixture();
  Object.assign(fixture.days[13], {
    isWorkday: false,
    hasPersonalOverride: true,
    personalOverride: "restday",
  });
  const normalized = core.normalizeCalendarResponse(fixture, "2026-09");
  assert.equal(normalized.days[12].personalOverride, null);
  assert.equal(normalized.days[13].personalOverride, "restday");
  assert.equal(normalized.days[25].personalOverride, "workday");
});

test("view model creates a Monday-first grid and renderer-ready semantics", () => {
  const calendar = core.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = core.buildCalendarViewModel(calendar, {
    source: "network",
    successfulFetchedAt: "2026-09-13T01:03:00.000Z",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  assert.equal(vm.title, "2026年9月");
  assert.equal(vm.grid.length, 5);
  assert.equal(vm.grid[0][0], null);
  assert.equal(vm.grid[0][1].number, 1);
  assert.equal(vm.grid[1][6].isToday, true);
  assert.equal(vm.grid[3][4].visual, "holiday");
  assert.equal(vm.grid[3][5].visual, "personalWork");
  assert.deepEqual(vm.notes, ["排班", "加班"]);
  assert.match(vm.freshness.text, /^更新于 /);
});

test("cached view model advances only the presentation today cursor and declares stale", () => {
  const calendar = core.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = core.buildCalendarViewModel(calendar, {
    source: "cache",
    successfulFetchedAt: "2026-09-13T01:03:00.000Z",
    now: new Date("2026-09-14T02:00:00.000Z"),
  });
  assert.equal(vm.serverToday, "2026-09-13");
  assert.equal(vm.displayToday, "2026-09-14");
  assert.equal(vm.freshness.stale, true);
  assert.match(vm.freshness.text, /^缓存 /);
});

test("view model preserves a six-row month without inventing calendar facts", () => {
  const calendar = core.normalizeCalendarResponse(calendarFixture({
    month: "2026-08",
    today: "2026-08-01",
  }), "2026-08");
  const vm = core.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-08-01T01:00:00.000Z"),
  });
  assert.equal(vm.grid.length, 6);
  assert.equal(vm.grid.flat().filter(Boolean).length, 31);
  assert.equal(vm.grid[0][5].number, 1);
  assert.equal(vm.grid[5][0].number, 31);
});
