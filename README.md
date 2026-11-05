# 无名杀 · 精简版

基于 [libnoname/noname](https://github.com/libnoname/noname) 的浏览器卡牌游戏，使用 pnpm workspace 管理游戏核心、文件服务、联机服务和桌面／移动客户端。当前版本统一使用仓库内实现的十周年风格主题。

## 保留的内容

- 模式：身份（默认八人）、国战、斗地主、单挑、对决（2v2、3v3、4v4）和联机。
- 武将：标准、神话再临、经典神将、一将成名、界限突破、璀璨星河、系列专属、新一将成名、OL 专属、文德武备、门阀士族、群英荟萃、限定专属、移动版、始计篇、谋攻篇、兵势篇、联动卡和怀旧，共 19 包。
- 卡牌：标准、军争、国战、应变篇、九变篇、用间篇、忠胆英杰、逐鹿天下和活动卡牌，共 9 包。

固定外观采用长布局、流沙牌背和玻璃体力条。扩展安装／开发入口、外观切换入口以及未保留模式、武将包和修仙牌包的源码已移除；共用图片、字体和音效继续保留。

支持内容的唯一清单是 [product.js](apps/core/noname/util/product.js)。读取旧存档时会过滤不支持的内容、恢复固定外观，并将失效模式回退到身份模式；联网地址、昵称和保留模式的设置继续沿用。详细范围见[精简版说明](docs/精简版说明.md)。

## 环境与启动

- Node.js：建议使用与 CI 一致的 24 版本。
- pnpm：10 或 11；CI 使用 10。
- 浏览器构建目标：Chromium 91 或更高、Safari 16.4 或更高；目前不支持 Firefox。请通过 HTTP 服务启动。

在仓库根目录执行：

```bash
pnpm install
pnpm dev
```

开发入口为 http://127.0.0.1:8081，文件服务监听 8089 端口。首次启动需自行确认游戏内 GPL 协议提示。

启动时使用独立的轻量引导页，入口及依赖加载失败时仍可重试和复制诊断。先准备界面素材进入选择界面，选择后加载包体和资料，再按顺序注册；立绘和语音继续按需加载。加载队列最多并发 4 个任务，每项任务有 60 秒超时与独立资源计时；菜单按需创建，重开和录像保留直达流程。发行构建合并模块并压缩代码，按内容指纹缓存代码分块，不再构建或注册即时编译 Service Worker。

文件服务仅提供静态资源和只读查询，存档写入 IndexedDB，导出由浏览器或客户端完成。普通静态 HTTP 托管也可启动。桌面端页面使用隔离沙盒；局域网建房通过主进程固定端口的受限消息桥保留。

## 构建与运行发布包

```bash
pnpm build
pnpm serve
```

完整发布包输出到根目录 `dist/`，包括游戏代码、保留包体的源码、图片、音效和文档。`pnpm serve` 在 8089 端口提供此目录；`pnpm start` 会先构建再启动服务。

仅构建核心及其 workspace 依赖：

```bash
pnpm -F noname... build
```

该命令输出 `apps/core/dist/`，不会合并根目录发布包的图片和音效。

`pnpm package` 会先构建，再将完整游戏复制到 `output/noname/`。所有发布渠道均提供全量包，包含图片、字体和音频，可独立运行；不再发布核心包、增量包或单独的资源包，iOS 包也保留全部立绘和语音。

游戏仅维护 `apps/core/package.json` 中的一个版本号。游戏界面、桌面安装包及 Android／iOS 包版本均从此处读取或在构建时同步；发布标签必须为对应的 `v版本号`。不再区分客户端版本与资源包版本。

游戏内保留武将包、卡牌包管理及存档导入／导出，移除扩展安装／加载、在线升级、更新源设置、素材包导入和游戏文件管理。“其它 → 关于”只显示游戏版本及全量版说明。

## 多线程构建

workspace 依赖按顺序完成构建，避免共享类型声明在清理时产生冲突。核心先完成本体构建和静态复制，再使用 Node.js `worker_threads` 并行构建武将、模式和卡牌三个包体类别。各线程分别写入 `dist/character`、`dist/mode`、`dist/card`，全部成功后才写入构建信息并进入发布包合并阶段。

默认线程数为可用 CPU 并行数与 3 的较小值。`NONAME_BUILD_WORKERS` 可设置为正整数，最多使用 3 个线程；低内存环境可设为 1。任一线程失败会使构建失败、停止派发后续任务，并终止其余构建线程。

PowerShell：

```powershell
$env:NONAME_BUILD_WORKERS = "1"
pnpm build
Remove-Item Env:NONAME_BUILD_WORKERS
```

macOS / Linux：

```bash
NONAME_BUILD_WORKERS=1 pnpm build
```

收益取决于 CPU、内存和磁盘；游戏事件处理继续遵循原有执行顺序。发布渠道可通过 `NONAME_BUILD_CHANNEL` 设置为 `test`、`nightly` 或 `release`，另支持 `NONAME_BUILD_COMMIT` 和 `NONAME_BUILD_TIME`；结果写入 `game/build-info.json`。

## 联机与客户端

本地联机大厅：

```bash
pnpm -F @noname/server dev
```

默认端口为 8082，在游戏联机地址中填写 `localhost:8082`。可通过 `--port` 或 `PORT` 修改服务端口。

大厅凭据仅保存摘要，默认存放于用户目录 `.noname/lobby-credentials`，可通过 `NONAME_LOBBY_DATA` 指定持久化目录；部署容器时请保留该目录。服务重启后凭据配对继续有效，房间和在线连接仍为临时状态。公共大厅限制新身份注册频率、每连接消息字节速率、发送缓冲和公开配置体积，并合并广播列表。所有平台的远端函数均需经过隔离；无法初始化隔离的客户端会明确报错。

桌面客户端在执行 `pnpm build` 后，可运行对应平台命令：

```bash
pnpm -F @noname/electron build:win
pnpm -F @noname/electron build:mac
pnpm -F @noname/electron build:linux
```

移动端构建和原生工具链要求见 [apps/mobile/README.md](apps/mobile/README.md)。

## 目录

| 路径                                     | 用途                                 |
| ---------------------------------------- | ------------------------------------ |
| `apps/core/noname/`                      | 引擎、界面、配置与启动流程           |
| `apps/core/character/`、`card/`、`mode/` | 保留的武将包、卡牌包和模式           |
| `apps/core/scripts/`                     | 核心构建、包体工作线程与资源清单工具 |
| `packages/fs/`                           | 本地文件与静态资源服务               |
| `packages/server/`                       | WebSocket 联机大厅                   |
| `packages/jit/`                          | Service Worker 即时编译支持          |
| `apps/electron/`、`apps/mobile/`         | 桌面与移动客户端                     |
| `scripts/`                               | 开发入口、发布包合并和线程调度       |
| `docs/`                                  | 引擎、技能与客户端开发文档           |

## 检查与贡献

```bash
pnpm test
pnpm lint
pnpm check:types
pnpm check:platforms
pnpm lint:engineering
pnpm test:browser
pnpm verify:assets
```

测试覆盖配置迁移、内容清单、构建并发、发布失败保护，以及文件越界、联机鉴权、失败入房、事件清理和数据库事务完成时机。修改加载或构建流程后还应执行核心构建；实际对局、存档迁移和联机行为需要人工回归。

浏览器检查需先完整构建及构建 Electron preload；Linux 无显示服务时使用 `xvfb-run -a pnpm test:browser`。完整发行目录包含逐文件 SHA-256 资源清单，`verify:assets` 校验文件大小、摘要和必要启动资源。存档导出具有格式版本，在同一事务内读取设置和数据，不携带内部恢复快照，不包含录像及自定义媒体。重置仅影响当前游戏，并保留联机身份及其凭据。

历史类型诊断采用数量和内容指纹双重基线，不能靠同类错误数量相抵来引入新问题；修复后执行 `node scripts/check-types.js --ratchet` 降低基线。平台 TypeScript 检查单独要求零错误。新增工程模块启用严格 lint 边界。

- [工程修复说明](docs/工程修复说明.md)
- [本轮修复与验收](docs/工程修复验收.md)
- [贡献指南](CONTRIBUTING.md)
- [Async 技能指南](docs/async-guide.md)
- [启动流程](docs/game-startup-flow.md)
- [事件系统](docs/game-event/index.md)

## 来源与许可

本项目源自 [libnoname/noname](https://github.com/libnoname/noname)，保留原作者及贡献者署名。使用、修改与分发请遵守仓库中的 [GPL-3.0 许可证](LICENSE)，二次分发请保留上游出处。原项目使用约定同时要求不用于商业用途。
