# 多AI长篇小说校对系统（前端）

单页应用（SPA），适配手机竖屏。支持文件上传（TXT/DOCX）与文字粘贴两种方式提交小说，三阶段 AI 流水线（结构 / 单章 / 专项）自动校对，错误抽屉逐条修复复检，最终报告页导出校对稿（TXT/DOCX）与错误报告（CSV）。

## 技术栈

Vue 3 + Vite 6 + Pinia + Vue Router（hash 模式）+ vue-virtual-scroller（虚拟滚动）。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 dist/
npm run preview  # 本地预览构建产物
```

## 部署到 GitHub Pages

本项目已内置 GitHub Actions 自动部署工作流（`.github/workflows/deploy.yml`），push 到 `main` 或 `master` 分支即自动构建并发布。

### 方式一：GitHub Actions 自动部署（推荐）

1. 在 GitHub 新建仓库（如 `novel-proofread`），将本项目全部文件推送上去：

   ```bash
   git init
   git add .
   git commit -m "init: 多AI长篇小说校对系统"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/novel-proofread.git
   git push -u origin main
   ```

2. 在仓库页面进入 **Settings → Pages**，将 **Source** 选为 **"GitHub Actions"**（不要选 Deploy from a branch）。
3. 回到 **Actions** 页签，等待 `Deploy to GitHub Pages` 工作流运行完成（绿色对勾）。
4. 访问地址：`https://<你的用户名>.github.io/novel-proofread/`

之后每次 push 代码都会自动重新部署。

### 方式二：手动上传产物（gh-pages 分支）

若不想用 Actions，可直接把 `dist/` 构建产物推送到 `gh-pages` 分支：

```bash
npm run build
npx gh-pages -d dist
```

然后在 **Settings → Pages** 将 Source 选为 **Deploy from a branch → gh-pages**。

### 部署要点说明

- `vite.config.js` 已设置 `base: './'`，构建产物使用相对路径，适配 Pages 子路径（`/<仓库名>/`）。
- 路由使用 hash 模式（`/#/dashboard`），GitHub Pages 为纯静态托管、无服务端回退，hash 路由刷新不会 404。
- `public/.nojekyll` 会随构建拷贝到 `dist/`，防止 Jekyll 处理含下划线开头的目录/文件。
- 本前端内置 mock 后端适配层（`src/api/request.js` 中 `USE_MOCK = true`），无后端也可全流程演示；接入真实后端时改为 `USE_MOCK = false` 并配置代理或接口地址。

## 五个核心视图

| 视图 | 路由 | 功能 |
| --- | --- | --- |
| 项目输入页 | `/#/` | 文件上传 / 文字输入（二选一），右下角加号提交 |
| 校对看板 | `/#/dashboard` | 章节瀑布流 + 底部三色进度条，三阶段自动执行 |
| 错误详情抽屉 | 看板内 | 按严重性分组展示错误，逐条修复并复检 |
| 最终报告页 | `/#/report` | 三色汇总、筛选、CSV/TXT/DOCX 导出、标记可交付 |
| 设置页 | `/#/settings` | AI 组别/模型/API Key/温度管理、测试连通性、保存 |
