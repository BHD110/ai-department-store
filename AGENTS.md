# Repository Guidelines

## 项目结构与模块职责

本仓库是「小镇百货」的 TypeScript + Vite 前端，使用原生 DOM 与 Canvas。`src/main.ts` 负责启动与模式选择。

- `src/game/`：演出调度与页面状态；`live.ts` 接收真实服务事件，`director.ts` 驱动离线模拟。
- `src/server/`：HTTP/SSE 客户端、服务端类型与数据适配，不是后端服务。
- `src/backend/`、`src/data/`：模拟角色、评分逻辑和内置商品、顾客、场景。
- `src/render/`：像素场景、精灵与装饰；`src/ui/`：顶栏、侧栏、来客条与弹窗。
- `src/types.ts`：共享领域类型；`src/*.css`：样式。图形主要通过代码绘制，无独立素材目录。
- `docs/API.md`：接口说明；`ROUND-REPORT.md`：历史实验报告。当前无测试目录。

## 安装、构建与本地开发

- `npm ci`：按 `package-lock.json` 安装依赖。
- `npm run dev`：启动开发页面，默认地址为 `http://localhost:5180`。
- `npm run build`：执行 TypeScript 检查，再构建到 `dist/`。
- `npm run preview`：预览构建产物；真实服务连接需另行配置，开发代理仅配置在 `server.proxy` 中。

离线开发使用 `http://localhost:5180/?mock=1`。真实模式需在外部项目 `daily-store-sim/server` 中运行 `python -m uvicorn store.app:app --host 127.0.0.1 --port 3040`；开发服务器将 `/api`、`/data` 转发至该端口。

## 编码与命名规范

沿用现有代码：两空格缩进、单引号、分号与 ES 模块；类型导入使用 `import type`。类和接口使用 PascalCase，函数与变量使用 camelCase，固定常量使用 UPPER_SNAKE_CASE；文件采用现有的 `state.ts`、`mockCustomer.ts` 等命名方式。

保持 TypeScript 严格检查通过，不留下未使用的变量或参数。当前没有 ESLint 或 Prettier 配置，修改时遵循所在文件的格式，避免无关重排。

## 验证要求

当前没有 `npm test`、自动化测试框架或覆盖率门槛。提交前运行 `npm run build`，并根据改动手动检查接待顾客、对话展示、暂停与倍速、库存、日报及 JSON 导出。UI 改动检查 Canvas 与侧栏是否遮挡。

服务端相关改动还需验证真实模式的事件流和状态更新；mock 验证不能替代真实接口验证。记录实际执行的检查和未验证项。历史轮次报告不代表当前代码已通过测试。

## 提交与 Pull Request

现有提交采用 `type(scope): 简短说明`，例如 `feat(web): 接上 v2 编排层`、`docs(round): 更新测试报告`。保持单次提交主题集中。

PR 应说明问题、行为变化、验证结果及服务端依赖；有关联 issue 时附链接，界面改动附截图或短录屏。接口变更同步更新文档，不提交 `node_modules/`、`dist/` 或密钥。

## 服务边界与配置

真实模式由服务端管理模型、账本与评分，前端只接收状态并呈现。不要将密钥或顾客隐藏需求传入店主上下文。

当前客户端默认使用 `/api/v2`；`?pipeline=v1` 切换旧接口，`?server=http://127.0.0.1:3040` 指定服务地址。`docs/API.md` 部分内容仍描述旧接口，修改前核对 `src/server/client.ts`、事件类型和实际服务行为。
