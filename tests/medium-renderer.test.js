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
  addStack() { const node = new NodeMock(); this.children.push(node); return node; }
  addText(value) { const node = new NodeMock("text", String(value)); this.children.push(node); return node; }
  addSpacer(value) { this.children.push(new NodeMock("spacer", value == null ? "" : String(value))); }
  layoutHorizontally() {}
  layoutVertically() {}
  centerAlignContent() {}
  centerAlignText() {}
  setPadding() {}
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

test("Large renderer prioritizes a compact header and summary before the airy calendar", () => {
  const calendar = globalThis.__PulseCalendarCore.normalizeCalendarResponse(calendarFixture(), "2026-09");
  const vm = globalThis.__PulseCalendarCore.buildCalendarViewModel(calendar, {
    source: "network",
    now: new Date("2026-09-13T01:04:00.000Z"),
  });
  const widget = globalThis.__PulseCalendarRuntime.renderLarge(vm);
  const output = textContent(widget).join(" ");
  assert.ok(output.indexOf("PULSE") < output.indexOf("2026年9月"));
  assert.equal(textNode(widget, "PULSE").font.size, 10);
  assert.equal(textNode(widget, "2026年9月").font.size, 12);
  assert.match(output, /工作/);
  assert.match(output, /节日/);
  assert.match(output, /中秋/);
  assert.match(output, /调班/);
  assert.ok(output.indexOf("工作") < output.indexOf("一"));
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "休").length, 1);
  assert.equal(allNodes(widget).filter((node) => node.type === "text" && node.text === "班").length, 1);
  assert.doesNotMatch(output, /undefined|null|NaN/);
});

test("Large calendar uses color, small markers and a light today outline", () => {
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
  const today = allNodes(widget).find((node) => node.borderColor?.hex === tokens.pulsePurple);
  assert.ok(today);
  assert.equal(today.borderWidth, 1);
  assert.equal(today.backgroundColor, undefined);
  assert.match(textContent(today).join(" "), /13/);
  assert.ok(allNodes(widget).some((node) => (
    node.backgroundColor?.hex === tokens.adjustedRestYellow
    && node.size?.width === tokens.layout.largeMarkerSize
  )));
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
