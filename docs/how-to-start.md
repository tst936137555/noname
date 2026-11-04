# 如何运行无名杀

环境、启动、构建和多线程配置统一见根目录 [README](../README.md#环境与启动)。

- 开发：在根目录运行 `pnpm install`、`pnpm dev`，浏览器访问 http://127.0.0.1:8081；文件服务端口为 8089。
- 发布包：运行 `pnpm build`、`pnpm serve`，访问 http://localhost:8089。
- 联机大厅：运行 `pnpm -F @noname/server dev`，游戏内填写 `localhost:8082`。
- 桌面构建：见 [README 的客户端说明](../README.md#联机与客户端)。
- 移动构建：见 [移动端说明](../apps/mobile/README.md)。

如果 PowerShell 的脚本执行策略阻止 `pnpm.ps1`，可以使用 `pnpm.cmd` 执行同一命令。
