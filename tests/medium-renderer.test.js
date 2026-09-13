import assert from "node:assert/strict";
import test from "node:test";
import "../src/core.js";
import { calendarFixture } from "./fixtures.js";

class NodeMock {
  constructor(type = "stack", text = "") {
    this.type = type;
    this.text = text;
    this.children = [];
  }
  addStack() { const node = new NodeMock(); node.parent = this; this.children.push(node); return node; }
  addText(value) { const node = new NodeMock("text", String(value)); node.parent = this; this.children.push(node); return node; }
  addSpacer(value) {
    const node = new NodeMock("spacer", value == null ? "" : String(value));
    node.parent = this;
    this.children.push(node);
  }
  layoutHorizontally() {}
  layoutVertically() {}
  centerAlignContent() {}
  centerAlignText() {}
  setPadding(top, left, bottom, right) { this.padding = [top, left, bottom, right]; }
  async presentSmall() {}
  async presentMedium() {}
  async presentLarge() {}
}

globalThis.ListWidget = class ListWidget extends NodeMock {};
globalThis.Color = class Color { constructor(hex, alpha = 1) { this.hex = hex; this.alpha = alpha; } };
globalThis.Font = {
  boldSystemFont: (size) => ({ weight: "bold", size }),
  semiboldSystemFont: (size) => ({ weight: "semibold", size }),
  mediumSystemFont: (size) => ({ weight: "medium", size }),
};
globalThis.Size = class Size { constructor(width, height) { this.width = width; this.height = height; } };

await import("../src/runtime.js");

function textContent(node) {
  return [node.type === "text" ? node.text : "", ...node.children.flatMap(textContent)].filter(Boolean);
}

function allNodes(node) {
  return [node, ...node.children.flatMap(allNodes)];
}

function textNode(node, value) {
  return allNodes(node).find((item) => item.type === "text" && item.text === value);
}

function largeDayCells(widget, tokens) {
  return allNodes(widget).filter((node) => (
    node.size?.width === tokens.layout.largeCellWidth
    && node.size?.height === tokens.layout.largeCellHeight
  ));
}

function largeDateLayout(cell, value) {
  const text = textNode(cell, value);
  return { text, decoration: text?.parent, dateRow: text?.parent?.parent };
}

function luminance(hex) {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("renderers share the required Pulse design tokens", () => {
  const tokens = globalThis.__PulseCalendarRuntime.designTokens;
  for (const key of [
    "background",
    "primaryText",
    "secondaryText",
    "mutedText",
    "pulsePurple",
    "holidayRed",
    "workCyan",
    "adjustedRestYellow",
    "todayBackground",
    "spacing",
    "radius",
    "headerFont",
    "calendarFont",
    "footerFont",
  ]) assert.ok(tokens[key], `missing design token: ${key}`);
  for (const tone of [
    "primaryText",
    "secondaryText",
    "mutedText",
    "pulsePurple",
    "holidayRed",
    "workCyan",
    "adjustedRestYellow",
  ]) assert.ok(contrast(tokens[tone], tokens.background) >= 4.5, `${tone} contrast is too low`);
  assert.ok(contrast(tokens.primaryText, tokens.todayBackground) >= 4.5);
});

test("Medium renderer consumes only the view model and produces a complete safe widget tree", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  const widget = globalThis.__PulseCalendarRuntime.renderMedium(vm);
  const output = textContent(widget).join(" ");
  assert.match(output, /2026年9月/);
  assert.match(output, /PULSE/);
  assert.match(output, /更新于/);
  assert.match(output, /假 休 班 改/);
  assert.doesNotMatch(output, /undefined|null|NaN/);
  assert.equal(widget.refreshAfterDate instanceof Date, true);
  assert.equal(widget.backgroundColor.hex, globalThis.__PulseCalendarRuntime.designTokens.background);
  assert.equal(
    textNode(widget, "PULSE").textColor.hex,
    globalThis.__PulseCalendarRuntime.designTokens.pulsePurple,
  );
  const todayContainer = allNodes(widget).find((node) => (
    node.backgroundColor?.hex === globalThis.__PulseCalendarRuntime.designTokens.todayBackground
  ));
  assert.ok(todayContainer);
  assert.match(textContent(todayContainer).join(" "), /13/);
});

test("Small renderer uses a purpose-built today and next-important-date composition", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "cache",
    now: new Date("2026-09-14T01:04:00.000Z"),
  });
  const widget = globalThis.__PulseCalendarRuntime.renderSmall(vm);
  const output = textContent(widget).join(" ");
  assert.match(output, /2026年9月/);
  assert.match(output, /PULSE/);
  assert.match(output, /14/);
  assert.match(output, /工作日/);
  assert.match(output, /下一项 9月20日 · 调班/);
  assert.match(output, /缓存/);
  assert.doesNotMatch(output, /29 30/);
  assert.doesNotMatch(output, /undefined|null|NaN/);
});

test("Large v2 uses a lightweight header and single-line summary before the calendar", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const output = textContent(widget).join(" ");
  assert.ok(output.indexOf("PULSE") < output.indexOf("2026年9月"));
  assert.equal(textNode(widget, "PULSE").font.size, 9);
  assert.equal(textNode(widget, "2026年9月").font.size, 11);
  assert.match(output, /工作/);
  assert.match(output, /节日/);
  assert.match(output, /中秋/);
  assert.match(output, /调班/);
  assert.ok(output.indexOf("工作") < output.indexOf("一"));
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "休").length, 1);
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "班").length, 1);
  assert.doesNotMatch(output, /undefined|null|NaN/);
});

test("Large v2 always renders a complete 6 by 7 calendar with muted adjacent dates", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  const summaryBeforeRender = structuredClone(vm.summary);
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const tokens = globalThis.__PulseCalendarRuntime.designTokens;
  const cells = largeDayCells(widget, tokens);
  assert.equal(cells.length, 42);
  const calendarRows = widget.children.filter((node) => (
    node.children.filter((child) => (
      child.size?.width === tokens.layout.largeCellWidth
      && child.size?.height === tokens.layout.largeCellHeight
    )).length === 7
  ));
  assert.equal(calendarRows.length, 6);
  for (const row of calendarRows) {
    const columns = row.children.filter((node) => node.type === "stack");
    const gaps = row.children.filter((node) => node.type === "spacer");
    assert.equal(columns.length, 7);
    assert.ok(columns.every((node) => node.size.width === tokens.layout.largeCellWidth));
    assert.equal(gaps.length, 6);
    assert.ok(gaps.every((node) => node.text === ""));
  }
  assert.equal(
    widget.children.filter((node) => (
      node.type === "spacer" && node.text === String(tokens.spacing.largeCalendarRow)
    )).length,
    5,
  );
  assert.equal(textNode(cells[0], "31").textColor.hex, tokens.mutedText);
  assert.equal(textNode(cells[41], "11").textColor.hex, tokens.mutedText);
  assert.deepEqual(vm.summary, summaryBeforeRender);
});

test("Large date Text uses the full column path without a narrow fixed-width frame", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, { source: "network" });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const tokens = globalThis.__PulseCalendarRuntime.designTokens;
  const cells = largeDayCells(widget, tokens);
  for (const value of ["1", "9", "10", "11", "12", "13", "14", "17", "18", "20", "21", "28", "29", "30", "31"]) {
    const matchingCells = cells.filter((cell) => textContent(cell).includes(value));
    assert.ok(matchingCells.length > 0, `missing rendered date: ${value}`);
    for (const cell of matchingCells) {
      const layout = largeDateLayout(cell, value);
      assert.ok(layout.text, `missing date Text: ${value}`);
      assert.equal(layout.decoration.size, undefined, `fixed date frame found: ${value}`);
      assert.deepEqual(layout.decoration.padding, [0, tokens.layout.largeDateHorizontalPadding, 0, tokens.layout.largeDateHorizontalPadding]);
      assert.equal(layout.dateRow.size.width, tokens.layout.largeCellWidth);
      assert.equal(layout.dateRow.size.height, tokens.layout.largeDateHeight);
      assert.equal(layout.text.font.size, 15);
      assert.equal(layout.text.minimumScaleFactor, 1);
    }
  }
});

test("Large v2 keeps status color and tiny marker semantics without repeated rest labels", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const tokens = globalThis.__PulseCalendarRuntime.designTokens;
  assert.equal(textNode(widget, "25").textColor.hex, tokens.holidayRed);
  assert.equal(textNode(widget, "20").textColor.hex, tokens.workCyan);
  assert.equal(textNode(widget, "26").textColor.hex, tokens.adjustedRestYellow);
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "休").length, 1);
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "中秋").length, 1);
  assert.ok(allNodes(widget).some((node) => (
    node.backgroundColor?.hex === tokens.adjustedRestYellow
    && node.size?.width === tokens.layout.largeMarkerSize
    && node.size?.height === tokens.layout.largeMarkerSize
  )));
  const workCell = largeDayCells(widget, tokens).find((cell) => textContent(cell).includes("20"));
  const workDate = largeDateLayout(workCell, "20");
  const workMarker = allNodes(workCell).find((node) => node.backgroundColor?.hex === tokens.workCyan);
  assert.equal(workDate.dateRow.parent, workCell);
  assert.equal(workMarker.parent.parent, workCell);
  assert.notEqual(workMarker.parent, workDate.dateRow);
});

test("Large v2 deduplicates a continuous holiday label across all holiday days", () => {
  const raw = calendarFixture();
  for (const date of ["2026-09-25", "2026-09-26", "2026-09-27"]) {
    Object.assign(raw.days.find((day) => day.date === date), {
      isHoliday: true,
      holidayName: "中秋",
    });
  }
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(raw, "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, { source: "network" });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "中秋").length, 1);
});

test("Large v2 today outline hugs the date and coexists with a holiday marker", () => {
  const raw = calendarFixture({ today: "2026-09-25" });
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(raw, "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, { source: "network" });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const tokens = globalThis.__PulseCalendarRuntime.designTokens;
  const todayCell = largeDayCells(widget, tokens).find((cell) => textContent(cell).includes("25"));
  const today = allNodes(widget).find((node) => node.borderColor?.hex === tokens.pulsePurple);
  assert.ok(today);
  assert.equal(today.borderWidth, 1);
  assert.equal(today.backgroundColor, undefined);
  assert.equal(today.size, undefined);
  assert.deepEqual(today.padding, [0, tokens.layout.largeDateHorizontalPadding, 0, tokens.layout.largeDateHorizontalPadding]);
  assert.equal(today.parent.size.width, tokens.layout.largeCellWidth);
  assert.equal(today.parent.size.height, tokens.layout.largeDateHeight);
  assert.match(textContent(today).join(" "), /25/);
  assert.match(textContent(todayCell).join(" "), /中秋/);
});

test("successful widget roots open the native iOS Calendar", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, { source: "network" });
  const runtime = globalThis.__PulseCalendarRuntime;
  assert.equal(runtime.renderLarge(vm).url, "calshow://");
  assert.equal(runtime.renderMedium(vm).url, runtime.CALENDAR_URL);
  assert.equal(runtime.renderSmall(vm).url, runtime.CALENDAR_URL);
});

test("Family dispatch defaults unsupported sizes to Medium", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, { source: "network" });
  assert.ok(globalThis.__PulseCalendarRuntime.renderForFamily("small", vm));
  assert.ok(globalThis.__PulseCalendarRuntime.renderForFamily("large", vm));
  assert.ok(globalThis.__PulseCalendarRuntime.renderForFamily("extraLarge", vm));
});
