# 本地只读资源服务

通过 `pnpm serve` 提供根目录的完整发行包；开发模式通过 Vite 代理只读查询。默认只监听 `127.0.0.1:8089`，拒绝跨来源请求、异常 Host、越界路径及指向根目录外的目录联接。

可用查询为 `/checkFile`、`/checkDir`、`/readFile`、`/readFileAsText` 与 `/getFileList`。写入、创建与删除接口已移除；游戏存档使用 IndexedDB，导出使用浏览器下载。用户数据目录与安装资源分离。

代码中需要自行等待就绪时，使用 `createApp({ dirname, listen: false })` 创建服务，再 `await app.listen({ port, host: "127.0.0.1" })`；服务由调用方负责关闭。
