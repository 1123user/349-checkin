# AGENTS.md · 349 打卡 PWA

新医大 349 药学综合的每日打卡应用。纯静态 PWA，无构建、无依赖。
线上：https://1123user.github.io/349-checkin/ ｜ 仓库 `1123user/349-checkin`

## 本地怎么看
直接双击 `index.html`，或 `python3 -m http.server`（Service Worker 需 http 才生效）。
**没有 dev server、没有 npm**，改完刷新即可。

## 文件分工
- `index.html` — 单页 UI（日历、打卡、统计）
- `349打卡.js` — 全部逻辑；读 `plan3.json`（计划）、`progress.json`（打卡记录）、`ai.json`（AI 生成的每日提示）
- `plan3.json` — **核心数据**：三科（药理/有机/分析）的每日任务
- `sw.js` + `manifest.webmanifest` — 离线缓存与安装；改了 js/css 要升 `sw.js` 的缓存版本号，否则手机上还是旧版
- `tools/` — 计划生成器：`gen_pharm_plan.py`、`gen_org_plan.py`、`gen_ana_plan.py`、`ai_daily.py`、`make_install.py`、`gen_icon.py`
- `install.html` — 安装引导页

## 约定
- 改 `plan3.json` 前先备份；`*.bak-*` 已在 `.gitignore` 里，历史备份只留 Mac 归档
  （`~/本机资源库/软件资源库/349PWA归档/`），别再堆在仓库工作区
- 计划以脚本生成为准（`tools/gen_*.py`），**不要手工大改 plan3.json**，否则下次重跑会被覆盖
- `progress.json` 是用户真实打卡记录，**任何脚本都不要重写它**
- 图标改 `icon-*.png` 后跑 `gen_icon.py` 补齐全部尺寸
- 发布见下节「发布铁律」

## 发布铁律（2026-11-03 定版）
**文件级发布走 GitHub Contents API，不要 `git push`**。本地 clone 常年落后 Actions 的每日
提交（`tomorrow.json` / `rec.json` / `plan3.json`），一 push 就分叉，rebase 还会把等价提交重放。

```bash
python3 tools/publish_pages.py          # 小满：脚本 + 清单（自动重算 size/sha1/build）
python3 tools/publish_pages.py AGENTS.md index.html
python3 tools/publish_pages.py --dry    # 只看会推什么
```

小满的约定：`xiaoman-v47.js` 固定文件名覆盖；改了脚本必须升 `BUILD` 与 `UI_VER`
（`xiaoman-latest.json` 的 build/ui 由脚本重算），否则手机端「更新小满」判定同版本不更新。
发布器会轮询线上 manifest，确认 `build` 真的翻新才算完成（Pages 约 45s）。

**需要拉每日 Actions 成果时**：`git pull --ff-only`；一旦报「diverged」，先
`git cherry -v origin/main HEAD` 看哪些是 `-`（等价重复、可直接丢）、哪些是 `+`（真新提交），
不要一看到 "ahead N" 就 rebase。

## 硬指标：零收集（2026-11-02 起，不可协商）
本仓发布的 Stash 覆写/脚本会在手机上 MITM 明文，所以**任何一处上报都算事故**。
新增或修改 `adblock/`、`bili/` 下的东西，必须同时满足：

1. 脚本不联网：禁止 `$httpClient`、`$task.fetch`、`fetch(`、`XMLHttpRequest`、
   `sendBeacon`、`WebSocket`、`new Image(`、`require(` / `import(`；
2. 不落盘留痕：禁止 `$persistentStore.write`、`$prefs.setValueForKey`、
   `localStorage.setItem`、写 cookie；`console.log` 在拼装时剥掉；
3. 脚本一律 `payload` 内联，`script-providers` 不得出现第三方 `url:`
   （仅允许自家 `1123user.github.io`）；
4. 覆写规则只允许 `reject`，不允许 `redirect` 等把流量导去别处的动作；
5. 上游规则集若新增 `script`，`build_adblock.py` 直接拒绝拼装，先人工审计。

提交前必须跑过：

```bash
python3 tools/audit_no_collect.py adblock bili   # 退出码 0 才算过
```

`tools/build_adblock.py` 已内置这条门禁；审计不过不落盘。审计本身也有回归：
`tools/audit_no_collect.py` 审的是「有没有出网点」，不是「作者声明」。别用注释糊弄它。
