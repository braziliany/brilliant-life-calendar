// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: download;

const INSTALL_URL = "https://raw.githubusercontent.com/braziliany/brilliant-life-calendar/main/Pulse%20Calendar.js";
const TARGET_FILENAME = "Pulse Calendar.js";

function installerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseSemver(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) return null;
  const prerelease = match[4] ? match[4].split(".") : [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  return { raw: value.trim(), numbers: match.slice(1, 4).map(Number), prerelease };
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  if (!left || !right) throw installerError("INVALID_SEMVER");
  for (let index = 0; index < 3; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) return left.numbers[index] < right.numbers[index] ? -1 : 1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart == null || rightPart == null) return leftPart == null ? -1 : 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function extractReleaseMetadata(script) {
  if (typeof script !== "string") throw installerError("MISSING_RELEASE_METADATA");
  const match = script.match(/const RELEASE_METADATA_JSON = `([^`]*)`;/);
  if (!match) throw installerError("MISSING_RELEASE_METADATA");
  let metadata;
  try { metadata = JSON.parse(match[1]); } catch { throw installerError("INVALID_RELEASE_METADATA"); }
  if (!parseSemver(metadata?.version) || !Array.isArray(metadata?.notes)) throw installerError("INVALID_RELEASE_METADATA");
  const notes = metadata.notes.filter((note) => typeof note === "string" && note.trim()).map((note) => note.trim());
  if (notes.length === 0) throw installerError("INVALID_RELEASE_METADATA");
  return { version: metadata.version, notes };
}

function localVersion(script) {
  try { return { version: extractReleaseMetadata(script).version, source: "release-metadata" }; } catch {}
  if (typeof script === "string") {
    const legacy = script.match(/const\s+(?:VERSION|APP_VERSION)\s*=\s*["']([^"']+)["']/);
    if (legacy && parseSemver(legacy[1])) return { version: legacy[1], source: "legacy-constant" };
  }
  return { version: null, source: "legacy-unknown" };
}

function validateScriptContent(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw installerError("EMPTY_RESPONSE");
  const content = value.trim();
  if (/^\s*(?:<!doctype\s+html|<html|<head|<body)\b/i.test(content) || /<\/html>/i.test(content)) {
    throw installerError("HTML_RESPONSE");
  }
  const markers = ["// Variables used by Scriptable.", "__PulseCalendarRuntime", "Script.setWidget"];
  if (content.length < 500 || !markers.every((marker) => content.includes(marker))) throw installerError("INVALID_SCRIPT_RESPONSE");
  return { content: `${content}\n`, release: extractReleaseMetadata(content) };
}

async function downloadProductionScript() {
  const request = new Request(INSTALL_URL);
  request.method = "GET";
  request.timeoutInterval = 20;
  const body = await request.loadString();
  const status = Number(request.response?.statusCode || 0);
  if (status !== 200) throw installerError(`DOWNLOAD_HTTP_${status || "UNKNOWN"}`);
  return validateScriptContent(body);
}

function installationPlan(existing, release) {
  const notes = `更新内容：\n${release.notes.map((note) => `• ${note}`).join("\n")}`;
  const preserved = "Keychain 凭据与现有配置不会被覆盖。";
  if (existing == null) return {
    state: "install", title: "安装 Pulse Calendar", action: "安装",
    message: `远端：${release.version}\n\n${notes}\n\n${preserved}`,
  };
  const local = localVersion(existing);
  if (!local.version) return {
    state: "legacy", title: "更新旧版 Pulse Calendar", action: "覆盖安装",
    message: `本地：旧版 / 版本未知\n远端：${release.version}\n\n${notes}\n\n${preserved}`,
  };
  const comparison = compareSemver(local.version, release.version);
  if (comparison < 0) return {
    state: "update", title: "更新 Pulse Calendar", action: "更新",
    message: `本地：${local.version}\n远端：${release.version}\n\n${notes}\n\n${preserved}`,
  };
  if (comparison === 0) return {
    state: "reinstall", title: "重新安装 Pulse Calendar", action: "重新安装",
    message: `本地：${local.version}\n远端：${release.version}\n\n${notes}\n\n${preserved}`,
  };
  return {
    state: "newer", title: "当前本地版本较新", action: "降级安装", destructive: true,
    message: `本地：${local.version}\n远端：${release.version}\n\n远端版本较旧。如继续，将以远端版本覆盖本地脚本。\n\n${notes}\n\n${preserved}`,
  };
}

async function confirmPlan(plan) {
  const alert = new Alert();
  alert.title = plan.title;
  alert.message = plan.message;
  if (plan.destructive) alert.addDestructiveAction(plan.action);
  else alert.addAction(plan.action);
  alert.addCancelAction("取消");
  return (await alert.presentAlert()) === 0;
}

async function readExisting(fileManager, targetPath) {
  if (!fileManager.fileExists(targetPath)) return null;
  if (fileManager.isFileDownloaded && !fileManager.isFileDownloaded(targetPath)) await fileManager.downloadFileFromiCloud(targetPath);
  return fileManager.readString(targetPath);
}

async function showInstalled(plan, version) {
  const alert = new Alert();
  alert.title = plan.state === "install" ? "安装完成" : "脚本已更新";
  alert.message = `Pulse Calendar ${version} 已写入 Scriptable。\n\n请打开 Pulse Calendar，按首次运行流程配置凭据，然后将它添加为 Scriptable Widget。`;
  alert.addAction("完成");
  await alert.presentAlert();
}

function userMessage(error) {
  const code = error?.code || error?.message || "UNKNOWN";
  if (code === "EMPTY_RESPONSE") return "下载内容为空，请稍后重试。";
  if (code === "HTML_RESPONSE") return "下载地址返回了网页，已拒绝安装。";
  if (code === "INVALID_SCRIPT_RESPONSE") return "下载内容不是有效的 Pulse Calendar 脚本。";
  if (["MISSING_RELEASE_METADATA", "INVALID_RELEASE_METADATA"].includes(code)) return "远端脚本缺少有效版本信息，已拒绝安装。";
  if (String(code).startsWith("DOWNLOAD_HTTP_")) return `下载失败（${code.replace("DOWNLOAD_HTTP_", "HTTP ")}）。`;
  return "安装失败，请检查网络后重试。";
}

async function showFailure(error) {
  const alert = new Alert();
  alert.title = "安装失败";
  alert.message = userMessage(error);
  alert.addAction("关闭");
  await alert.presentAlert();
}

async function install() {
  const fileManager = FileManager.iCloud();
  const targetPath = fileManager.joinPath(fileManager.documentsDirectory(), TARGET_FILENAME);
  const existing = await readExisting(fileManager, targetPath);
  const remote = await downloadProductionScript();
  const plan = installationPlan(existing, remote.release);
  if (!(await confirmPlan(plan))) return { installed: false, reason: "USER_DECLINED", state: plan.state, targetPath };
  fileManager.writeString(targetPath, remote.content);
  await showInstalled(plan, remote.release.version);
  return { installed: true, state: plan.state, version: remote.release.version, targetPath };
}

async function main() {
  try { await install(); } catch (error) { await showFailure(error); } finally { Script.complete(); }
}

globalThis.__BrilliantLifeCalendarInstaller = {
  INSTALL_URL, TARGET_FILENAME, parseSemver, compareSemver, extractReleaseMetadata,
  localVersion, validateScriptContent, downloadProductionScript, installationPlan, install, userMessage,
};

if (!globalThis.__BRILLIANT_LIFE_INSTALLER_TEST__) await main();
