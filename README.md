# 璀璨人生日历 / Brilliant Life Calendar

`璀璨人生 · Pulse` 的只读 Scriptable Calendar Widget。日历事实来自 Pulse Calendar Widget API，客户端只负责校验、缓存和展示，不在设备端复制业务规则。

## 当前能力

- Small / Medium / Large 三种 Widget
- 当前月月历
- 工作、休息、节日、调班和个人调整
- 今日高亮与月份统计
- 离线缓存及缓存更新时间
- 点击 Widget 打开 iOS 系统日历
- Cloudflare Access Service Token 认证

## 推荐安装

1. 在 Scriptable 中新建一个临时脚本。
2. 复制仓库中的 [`installer.js`](installer.js) 全部内容并粘贴。
3. 运行安装器，它会从 GitHub `main` 下载正式的 `Pulse Calendar.js`。
4. 首次运行 `Pulse Calendar`，按提示配置认证凭据。
5. 在 iOS 主屏幕添加 Scriptable Widget，并选择 `Pulse Calendar`。

安装器使用 Scriptable iCloud Documents。若目标脚本已经存在，会先明确询问；只有确认后才覆盖。安装器不会访问 Pulse API、读取或修改凭据，也不收集遥测。

正式脚本下载地址：

```text
https://raw.githubusercontent.com/braziliany/brilliant-life-calendar/main/Pulse%20Calendar.js
```

## Security

- 仓库不包含 Cloudflare Access Service Token。
- Client ID 和 Client Secret 不得提交到 Git，也不得写入普通文件、日志或缓存。
- 正式脚本仅通过 Scriptable Keychain 保存和读取凭据。
- Widget API 为只读接口。
- 安装器不处理、上传或下载任何凭据，也不修改 Keychain。

## Development

需要 Node.js 20 或更高版本。

```text
npm install
npm test
npm run build
npm run verify
```

其他可用检查：

```text
npm run check:bundle
```

`npm run build` 将 `src/` 中的源码构建为根目录下的 `Pulse Calendar.js`。该文件是可直接导入 Scriptable 的正式单文件产物；请修改源码后重新构建，不要直接维护生成文件。

## Project structure

```text
src/                 客户端源码
tests/               Normalizer、renderer、runtime、安全与安装器测试
scripts/             构建脚本
Pulse Calendar.js    Scriptable 正式单文件产物
installer.js         Scriptable 安装器
docs/                真机验收清单
```

## Status

```text
SCRIPTABLE v0.1 READY FOR LARGE UI DEVICE RE-ACCEPTANCE
```

本项目尚未创建 Tag 或 Release。
