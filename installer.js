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

function validateScriptContent(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw installerError("EMPTY_RESPONSE");
  }
  const content = value.trim();
  if (/^\s*(?:<!doctype\s+html|<html|<head|<body)\b/i.test(content) || /<\/html>/i.test(content)) {
    throw installerError("HTML_RESPONSE");
  }
  const scriptableMarkers = [
    "// Variables used by Scriptable.",
    "__PulseCalendarRuntime",
    "Script.setWidget",
  ];
  if (content.length < 500 || !scriptableMarkers.every((marker) => content.includes(marker))) {
    throw installerError("INVALID_SCRIPT_RESPONSE");
  }
  return `${content}\n`;
}

async function downloadProductionScript() {
  const request = new Request(INSTALL_URL);
  request.method = "GET";
  request.timeoutInterval = 20;
  const content = await request.loadString();
  const status = Number(request.response?.statusCode || 0);
  if (status !== 200) throw installerError(`DOWNLOAD_HTTP_${status || "UNKNOWN"}`);
  return validateScriptContent(content);
}

async function confirmOverwrite() {
  const alert = new Alert();
  alert.title = "Pulse Calendar 已存在";
  alert.message = "继续将覆盖现有脚本。现有凭据不会由安装器读取或修改。";
  alert.addDestructiveAction("确认覆盖");
  alert.addCancelAction("取消");
  return (await alert.presentAlert()) === 0;
}

async function showInstalled() {
  const alert = new Alert();
  alert.title = "安装完成";
  alert.message = "请打开 Pulse Calendar，按首次运行流程配置凭据，然后将它添加为 Scriptable Widget。";
  alert.addAction("完成");
  await alert.presentAlert();
}

function userMessage(error) {
  const code = error?.code || error?.message || "UNKNOWN";
  if (code === "EMPTY_RESPONSE") return "下载内容为空，请稍后重试。";
  if (code === "HTML_RESPONSE") return "下载地址返回了网页，已拒绝安装。";
  if (code === "INVALID_SCRIPT_RESPONSE") return "下载内容不是有效的 Pulse Calendar 脚本。";
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
  if (fileManager.fileExists(targetPath) && !(await confirmOverwrite())) {
    return { installed: false, reason: "OVERWRITE_DECLINED", targetPath };
  }

  const content = await downloadProductionScript();
  fileManager.writeString(targetPath, content);
  await showInstalled();
  return { installed: true, targetPath };
}

async function main() {
  try {
    await install();
  } catch (error) {
    await showFailure(error);
  } finally {
    Script.complete();
  }
}

globalThis.__BrilliantLifeCalendarInstaller = {
  INSTALL_URL,
  TARGET_FILENAME,
  validateScriptContent,
  downloadProductionScript,
  install,
  userMessage,
};

if (!globalThis.__BRILLIANT_LIFE_INSTALLER_TEST__) await main();
