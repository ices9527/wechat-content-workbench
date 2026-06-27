# WeChat Content Workbench

本地公众号内容生产工作台。第一轮 Sprint 0-1 目标：

- Next.js 本地应用可启动。
- SQLite 数据库可迁移并初始化默认用户。
- 可以新建文章项目。
- Linear 风格工作台可以显示文章状态和下一步动作。
- 基础单元/API 服务测试和 E2E smoke test 可运行。

## 本地启动

```bash
npm install
npm run db:migrate
npm run dev
```

默认访问：

```text
http://127.0.0.1:3000
```

## 测试

```bash
npm run test
npm run test:e2e
npm run lint
npm run typecheck
```

## 数据库

默认数据库路径：

```text
data/workbench.sqlite
```

可通过 `.env` 覆盖：

```text
DATABASE_URL=file:./data/workbench.sqlite
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

第一轮不调用真实 AI 或 WeChat，自动化测试使用 fake client。
