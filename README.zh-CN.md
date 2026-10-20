# 余额条（Balance Pill）

[![CI](https://github.com/Jayve/dsh-balance-pill/actions/workflows/ci.yml/badge.svg)](https://github.com/Jayve/dsh-balance-pill/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-balance-pill.svg)](https://www.npmjs.com/package/dsh-balance-pill)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 简体中文

在 DeepSeek Harness 输入框下方的 composer dock 里常驻一行小字：当前登录账户的钱包余额，以及本次会话开始以来钱包减少的金额。

![余额条在输入框下方](docs/preview.svg)

> 非官方社区插件，与 DeepSeek 官方无隶属关系，也未获其背书。

## 预览

输入框下方余额条的文字示意。实际界面会跟随主题与语言。

```text
  ┌─ 输入框 ────────────────────────────────────────────────────────
  │ 随便问点什么…
  │
  │ 缓存命中 0 · 轮次 3        (o) 余额 ¥6.19 · 本次 ¥0.42
  └─────────────────────────────────────────────────────────────────

  [就绪]      (o) 余额 ¥6.19 · 本次 ¥0.42
  [加载中]    (o) 余额 …
  [未登录]    (o) 余额 —
  [错误]      (o) 余额 — (http-503)

  ┌─ 悬停提示 ──────────────────────────────────────────────────────
  │ 充值 ¥6.19 · 赠送 ¥0.00 · 更新于 12:34:56
  │ 自 12:30:02 起累计
  │ 点击刷新
  └───────────────────────────────────────────────────────────────
```

余额条是一个可聚焦按钮：点击刷新，悬停查看明细和本次累计的起始时间。

## 显示内容

| 读数 | 含义 |
| --- | --- |
| **余额** | 充值余额 + 赠送余额，折算为同一币种。 |
| **本次** | 本次会话首次读数以来，观察到的钱包减少额累计。 |

- 悬停可看到充值/赠送明细、最后更新时间，以及「本次」从何时开始累计。
- 点击读数立即刷新。
- 此外每 60 秒、窗口重新获得焦点、以及每轮回复结束后（约 2.5 秒稳定期）自动刷新；两次自动读取至少间隔 15 秒。连续失败时按 120s → 240s → 300s 退避（上限 300s）。
- 页面重新加载时先显示上一次成功读数，避免输入框下方闪一下空值。

## 安装

环境要求：

- DeepSeek Harness Desktop 或 Web，版本 `0.2.1-rc.2` 至 `0.2.x`。
- 已登录 DeepSeek 账户（与账户菜单读取的是同一个钱包）。
- Host 侧存在 `deepseekAccount` 服务。桌面版账户栈自带该服务；不包含它的 headless 组合会返回 `account-unavailable`。

任选一种来源。

### 从 npm 安装

```sh
dsh plugin --profile web add dsh-balance-pill
```

已发布为 [`dsh-balance-pill`](https://www.npmjs.com/package/dsh-balance-pill)，npm 维护者账号为 `jayve-dev`。包名不带 scope，安装路径就是包名本身。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:Jayve/dsh-balance-pill
```

### 从本地 checkout 安装

```sh
git clone https://github.com/Jayve/dsh-balance-pill.git
dsh plugin --profile web add ./dsh-balance-pill
```

`web` 是 CLI Web 应用使用的 profile 名；桌面版通常叫 `desktop`，替换命令中的 profile 即可：

```sh
dsh plugin --profile desktop add dsh-balance-pill
```

安装后需要重启 Harness 进程（Host 代码改动不是刷新页面就能生效），然后重新加载 Web 页面。确认 bundle 层已经进入配置：

```sh
dsh --profile web --dump-config
```

应能看到 `# == dsh-balance-pill` 这一层，以及 `balance-pill` 行。如果插件已列出但界面没有余额条，见[故障排查](#故障排查)。

### 卸载

```sh
dsh plugin --profile web remove dsh-balance-pill
```

### 从本地版本迁移

如果还挂着 `@local/dsh-balance-meter` 之类的开发行，请先移除它，再安装本插件。否则输入框下方会出现两个余额条；新行 id 是 `balance-pill`，不会发生配置行冲突，但 dock 条目和轮询会重复。

## 工作原理

插件分为两半：

1. **Client**：在 `conversation.composer.dock` 槽位注册一个条目，轮询本地 JSON 路由，并把本次会话的累计值保存在 `localStorage`。
2. **Host**：在 Harness Web 服务器上提供 `GET /dsh-balance-pill/state`，向 Host 侧账户服务读取钱包，只返回聚合后的金额。

浏览器不直接调用账户 Remote，也接触不到令牌、账户 ID 或 Platform 请求头。这样拆分是因为当前桌面版里 Host 侧账户调用正常，但渲染进程调用 account Remote 可能失败；本地路由在 Web 与 Desktop 构建上都更稳定。

### 路由

`GET /dsh-balance-pill/state?locale=<界面语言>&tz=<时区偏移秒数>`

只接受环回对端、环回 `Host` authority 的 `GET` 请求，响应带 `Cache-Control: no-store`。

| 状态码 | 响应体 | 含义 |
| --- | --- | --- |
| `200` | `{"ok":true,"status":"ready","currency":"CNY","recharged":6.19,"granted":0,"total":6.19}` | 成功读到钱包。 |
| `200` | `{"ok":true,"status":"signed-out"}` | 没有已保存的 DeepSeek 凭据。 |
| `200` | `{"ok":true,"status":"failed"}` | Platform 余额查询失败。 |
| `403` | `{"ok":false,"error":"loopback-only"}` | 非环回对端。 |
| `403` | `{"ok":false,"error":"host-not-allowed"}` | `Host` 不是 `127.0.0.1`、`localhost` 或 `[::1]`。 |
| `405` | `{"ok":false,"error":"method-not-allowed"}` + `Allow: GET` | 方法不对。 |
| `502` | `{"ok":false,"error":"…"}` | 账户服务的未预期异常（消息截断到 200 字符）。 |
| `503` | `{"ok":false,"error":"account-unavailable"}` | 当前组合没有账户服务。 |

完整路由与账本约定见 [docs/architecture.md](docs/architecture.md)。

## 消费口径

插件计量的是钱包，不是 token，也不是价格表，因此适用于任意模型与计费规则。

- 两次读数之间的**余额下降**计入「本次」。
- **充值或赠送**只移动基线，不会产生负数消费。
- 基线与累计值按会话保存在 `dsh.balance-pill/v1/<sessionId>`。刷新页面不会清零；新会话从零开始。
- 切换界面语言或时区不会重置账本。
- 在同一会话中**切换账户**会沿用上一个账户的基线。需要干净读数时，请退出登录并新建会话，或删除该会话的 `localStorage` 键。
- **同一账户并行多个会话**时，每个会话都会把其他会话的消费算进自己的「本次」。钱包本身无法区分是哪个会话花的钱。
- Platform 账单可能延迟结算，读数会相应滞后。
- 小于 `0.01` 的金额显示 4 位小数，避免一次很小的请求看起来像免费。
- 账户同时持有 CNY 与 USD 钱包时只显示一个余额条，优先 CNY。

## 隐私与安全

- 路由挂在 Harness Web 服务器上，拒绝非环回对端。
- `Host` 头必须是环回 authority（`127.0.0.1`、`localhost` 或 `[::1]`）。解析到环回地址的公网域名会被拒绝，从而堵住 DNS rebinding 读取这条路由的路径。
- 与其它本地插件路由一样，这条路由**没有额外认证**：同一台机器上的任意进程都能读到余额数字。响应里只有币种金额，没有账户 ID、资料、令牌或流水。
- Client 只在 Harness 源下的 `localStorage` 保存最后一次汇总和按会话的账本，不含凭据。
- 插件不上报遥测。唯一的网络请求是 Host 账户服务发往已配置 DeepSeek Platform 域名的请求，与账户菜单相同。
- 浏览器 bundle 不加载远程内容，也不使用 `eval`。

## 配置

随包提供的 patch 以默认值启用插件，多数用户不需要配置。

`clientVersion` 是发给 Platform 账户接口的 UI 标识。默认情况下插件上报当前 Web Host 的 release 版本；取不到时回退到本版本测试过的版本。只有组合中隐藏了 `clientModules` 服务，或需要复现特定 Platform 客户端标识时才需要固定它：

```yaml
- id: balance-pill
  name: dsh-balance-pill
  config:
    clientVersion: 0.2.1-rc.2
```

刷新间隔和路由路径是固定值：前者是流量整形常量，后者是安全与兼容性常量，不作为部署配置项。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 完全没有余额条 | bundle 未激活。运行 `dsh --profile web --dump-config` 确认 `dsh-balance-pill` 层存在，再重启 Harness 进程并刷新页面。 |
| 显示 `余额 —` | 账户未登录，或凭据存储为空。从账户菜单登录。 |
| 悬停提示 `余额读取失败` | 看括号里的短错误码。`http-503` 表示组合里没有 `deepseekAccount` 服务；`http-502` 表示 Platform 查询抛错。 |
| 数字不变 | 账单可能延迟。点击余额条强制读取（仍受 in-flight 保护）。 |
| 「本次」偏高 | 同一账户的其它会话正在消费，或同一会话切换过账户。钱包无法归因到具体会话。 |
| `403 loopback-only` | 页面是通过局域网地址打开的。改用 `http://127.0.0.1:<端口>/`。 |
| `403 host-not-allowed` | 页面是通过解析到本机的非环回域名打开的。改用 `127.0.0.1`、`localhost` 或 `[::1]`。 |

## 兼容性

| 组件 | 支持范围 |
| --- | --- |
| DeepSeek Harness | `>=0.2.1-rc.2 <0.3.0`（写入 `engines.dsh`） |
| 界面 | Desktop Web GUI；CLI `web` profile |
| 账户服务 | `deepseekAccount`（DeepSeek 账户登录） |
| Node（仅开发） | `^22.19.0` 或 `>=24.0.0` |

manifest 声明了 `engines.dsh`，不兼容的 Harness 版本会拒绝加载 bundle，而不是半加载后崩溃。删掉该字段不是受支持的绕过方式；请附上 Harness 版本开 issue。

## 开发

包没有运行时依赖，也没有构建步骤。

```sh
npm test          # node --test：Host 路由、账本、格式化、loader 约定
npm run pack:check
```

目录：

```text
index.js              Host 路由与钱包汇总
client.js             Client bundle（dock 条目、轮询、账本）
test/host.test.mjs    路由与汇总测试
test/client.test.mjs  账本、存储与格式化测试
docs/                 预览图与架构说明
```

要在真实 Harness 里调试，在仓库根目录把 checkout 装进你用于 Web GUI 的 profile（不想影响日常配置时请使用一次性 profile）：

```sh
dsh plugin --profile web add .
dsh web --profile web
```

Host 改动需要重启进程；Client bundle 改动刷新页面即可。

Client 模块上的 `_internals` 是测试桥，不是公开 API。它让账本逻辑可以在不启动浏览器或 React 渲染器的情况下被测试。

## 发布

1. 更新 `CHANGELOG.md` 与 `package.json` 里的版本号。
2. `npm test && npm run pack:check`。
3. 提交、打 `vX.Y.Z` tag 并发布：
   - 用 `jayve-dev` npm 账号执行 `npm publish --access public`
   - 或推送 tag，让 `.github/workflows/release.yml` 使用仓库的 `NPM_TOKEN` secret 发布（token 需属于同一账号）。

## 许可证

[MIT](LICENSE) © 2026 Jayve
