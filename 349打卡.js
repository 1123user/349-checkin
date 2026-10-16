// 349三科打卡 · Scriptable 小组件 + 可滑动清单
// 数据源：https://1123user.github.io/349-checkin/plan3.json（本地缓存兜底）
// 进度存 iCloud Drive：Scriptable/349打卡/progress.json（两设备自动同步）

const BASE = "https://1123user.github.io/349-checkin/"
const fm = FileManager.iCloud()
const DIR = fm.joinPath(fm.documentsDirectory(), "349打卡")
const F_PLAN = fm.joinPath(DIR, "plan3.json")
const F_PROG = fm.joinPath(DIR, "progress.json")

const SUBS = ["org", "pharm", "ana"]
const SUB = {
  org:   { name: "有机", c: new Color("#FF453A") },
  pharm: { name: "药理", c: new Color("#FF9F0A") },
  ana:   { name: "分析", c: new Color("#0A84FF") },
}
const DIM = new Color("#8E8E93")
const TXT = new Color("#FFFFFF")

/* ---------- 小工具 ---------- */
const tid = t => t.sub + "|" + t.key + "|" + t.bvid
const p2 = n => String(n).padStart(2, "0")
function todayISO() {
  const d = new Date()
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate())
}
function hm(sec) {
  const m = Math.floor(sec / 60)
  return Math.floor(m / 60) + "h" + p2(m % 60)
}
function ensureDir() { if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true) }
async function ready(path) {
  if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
    await fm.downloadFileFromiCloud(path)
  }
}

/* ---------- 数据 ---------- */
function loadProg() {
  try {
    if (fm.fileExists(F_PROG)) {
      const o = JSON.parse(fm.readString(F_PROG))
      if (o && o.done) return o
    }
  } catch (e) {}
  return { done: {} }
}
function saveProg(p) {
  ensureDir()
  fm.writeString(F_PROG, JSON.stringify(p))
}
async function loadPlan() {
  let cached = null
  try {
    if (fm.fileExists(F_PLAN)) { await ready(F_PLAN); cached = JSON.parse(fm.readString(F_PLAN)) }
  } catch (e) {}
  try {
    const r = new Request(BASE + "plan3.json")
    r.timeoutInterval = 8
    const fresh = await r.loadJSON()
    if (fresh && fresh.days && fresh.days.length) {
      ensureDir()
      fm.writeString(F_PLAN, JSON.stringify(fresh))
      return fresh
    }
  } catch (e) {}
  if (cached) return cached
  return null
}

/* ---------- 统计 ---------- */
function allTasks(P) {
  const a = []
  P.days.forEach(d => d.tasks.forEach(t => a.push(t)))
  return a
}
function stats(P, S) {
  const u = [...new Set(allTasks(P).map(tid))]
  const dn = u.filter(k => S.done[k]).length
  return { total: u.length, done: dn, pct: u.length ? Math.round(dn / u.length * 100) : 0 }
}
function dayOf(P, iso) { return P.days.find(d => d.date === iso) || null }
function subStat(P, S, sub, day) {
  const ts = day ? day.tasks.filter(t => t.sub === sub) : allTasks(P).filter(t => t.sub === sub)
  const dn = ts.filter(t => S.done[tid(t)]).length
  return { n: ts.length, done: dn, pct: ts.length ? Math.round(dn / ts.length * 100) : 0 }
}

/* 小组件用的短标题：去掉课号前缀、B站标题的尾巴与口水词 */
function shortTitle(t) {
  let s = String(t.title)
  s = s.replace(/^Lecture\s*\d+\s*-\s*\d+\s*/, "")
  s = s.replace(/^第[一二三四五六七八九十百]+讲[：:\s]*/, "")
  s = s.replace(/^【[^】]*】\s*/, "")
  const noise = /^(带你背诵|期末复习|考研|学习分享|药理学背诵|必看|考点)/
  const segs = s.split(/[｜|]/).map(x => x.trim()).filter(x => x && !noise.test(x))
  s = segs.length ? segs[0] : s
  return s.length > 22 ? s.slice(0, 22) + "…" : s
}

/* ---------- 进度条（纯 Stack 实现，不依赖绘图） ---------- */
function bar(parent, color, frac, w) {
  const s = parent.addStack()
  s.layoutHorizontally()
  s.size = new Size(w, 5)
  s.backgroundColor = new Color("#FFFFFF", 0.16)
  s.cornerRadius = 2.5
  if (frac > 0) {
    const f = s.addStack()
    f.size = new Size(Math.max(4, w * frac), 5)
    f.backgroundColor = color
    f.cornerRadius = 2.5
  }
  s.addSpacer()
  return s
}

/* ---------- 小组件 ---------- */
function widgetHeader(w, P, S, iso, fam) {
  const d = dayOf(P, iso)
  const st = stats(P, S)
  const ex = new Date(P.meta.exam + "T00:00:00")
  const left = Math.max(0, Math.ceil((ex - new Date()) / 86400000))

  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const lf = row.addStack()
  lf.layoutVertically()
  const t1 = lf.addText(d ? "第 " + d.day + " 天" : "已收口")
  t1.font = Font.boldSystemFont(fam === "small" ? 22 : 26)
  t1.textColor = TXT
  const t2 = lf.addText(d ? d.date.slice(5).replace("-", "/") + " " + d.wd : "阶段一结束")
  t2.font = Font.mediumSystemFont(11)
  t2.textColor = DIM

  row.addSpacer()

  const rf = row.addStack()
  rf.layoutVertically()
  rf.centerAlignContent()
  const r1 = rf.addText(st.pct + "%")
  r1.font = Font.boldSystemFont(fam === "small" ? 20 : 24)
  r1.textColor = TXT
  const r2 = rf.addText("D-" + left + " · " + st.done + "/" + st.total)
  r2.font = Font.mediumSystemFont(10)
  r2.textColor = DIM
  return d
}

function widgetSubjects(w, P, S, d, barW) {
  SUBS.forEach(k => {
    const ss = subStat(P, S, k, d)
    const r = w.addStack()
    r.layoutHorizontally()
    r.centerAlignContent()
    const nm = r.addText(SUB[k].name)
    nm.font = Font.semiboldSystemFont(12)
    nm.textColor = SUB[k].c
    r.addSpacer(6)
    bar(r, SUB[k].c, ss.pct / 100, barW)
    r.addSpacer(6)
    const ct = r.addText(ss.done + "/" + ss.n)
    ct.font = Font.mediumSystemFont(11)
    ct.textColor = DIM
  })
}

function widgetTasks(w, P, S, d, maxN) {
  const list = d.tasks.filter(t => !S.done[tid(t)])
  const shown = (list.length ? list : d.tasks).slice(0, maxN)
  if (!list.length) {
    const t = w.addText("今天全部打完了 ✓")
    t.font = Font.semiboldSystemFont(13)
    t.textColor = new Color("#30D158")
    return
  }
  shown.forEach(t => {
    const r = w.addStack()
    r.layoutHorizontally()
    const dot = r.addText(S.done[tid(t)] ? "✓" : "○")
    dot.font = Font.boldSystemFont(12)
    dot.textColor = S.done[tid(t)] ? new Color("#30D158") : SUB[t.sub].c
    r.addSpacer(5)
    const tx = r.addText(t.key + " " + shortTitle(t))
    tx.font = Font.systemFont(11)
    tx.textColor = new Color("#D1D1D6")
    tx.lineLimit = 1
    r.addSpacer(5)
    const du = r.addText(t.dur)
    du.font = Font.mediumSystemFont(10)
    du.textColor = DIM
  })
  const rest = list.length - shown.length
  if (rest > 0) {
    const t = w.addText("还有 " + rest + " 项")
    t.font = Font.mediumSystemFont(10)
    t.textColor = DIM
  }
}

function buildWidget(P, S) {
  const fam = config.widgetFamily || "medium"
  const iso = todayISO()
  const w = new ListWidget()
  w.setPadding(14, 15, 14, 15)
  const g = new LinearGradient()
  g.colors = [new Color("#1C1C1E"), new Color("#0A0A0C")]
  g.locations = [0, 1]
  w.backgroundGradient = g
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)

  if (!P) {
    w.addSpacer()
    const t = w.addText("排期加载失败，请在有网时打开一次")
    t.font = Font.systemFont(12)
    t.textColor = DIM
    w.addSpacer()
    return w
  }

  const d = widgetHeader(w, P, S, iso, fam)
  w.addSpacer(fam === "small" ? 6 : 8)
  widgetSubjects(w, P, S, d, fam === "small" ? 34 : 62)
  if (fam === "large") {
    w.addSpacer(10)
    widgetTasks(w, P, S, d, 8)
  }
  if (fam === "small" && d) {
    w.addSpacer(6)
    const done = d.tasks.filter(t => S.done[tid(t)]).length
    const t = w.addText("今日 " + done + "/" + d.tasks.length + " · " + hm(d.min * 60))
    t.font = Font.mediumSystemFont(10)
    t.textColor = DIM
  }
  return w
}
/* ---------- 可滑动清单 ---------- */
function mrow(text, sub, color) {
  const r = new UITableRow()
  r.height = sub ? 60 : 44
  const c = r.addText(text, sub || "")
  c.titleFont = Font.semiboldSystemFont(sub ? 15 : 14)
  c.subtitleFont = Font.systemFont(11)
  c.titleColor = color || TXT
  c.subtitleColor = DIM
  return r
}

function head(text, note) {
  const r = new UITableRow()
  r.height = 32
  r.isHeader = true
  const c = r.addText(text, note || "")
  c.titleFont = Font.boldSystemFont(12)
  c.subtitleFont = Font.systemFont(10)
  c.titleColor = DIM
  c.subtitleColor = DIM
  return r
}

function taskRows(t, P, S, d, rerender) {
  d.tasks.forEach(task => {
    const on = !!S.done[tid(task)]
    const r = mrow(
      (on ? "✓ " : "○ ") + "[" + task.key + "] " + task.title,
      SUB[task.sub].name + " · " + task.dur + " · " + task.level + (task.note ? " · " + task.note : ""),
      on ? new Color("#30D158") : SUB[task.sub].c
    )
    r.dismissOnSelect = false
    r.onSelect = () => {
      if (on) delete S.done[tid(task)]; else S.done[tid(task)] = Date.now()
      saveProg(S)
      rerender()
    }
    const b = r.addButton("▶")
    b.titleColor = DIM
    b.onTap = () => Safari.open(task.url)
    t.addRow(r)
  })
}

function dayTable(P, S, d) {
  const t = new UITable()
  t.showSeparators = false
  const render = () => {
    t.removeAllRows()
    const done = d.tasks.filter(x => S.done[tid(x)]).length
    t.addRow(head("第 " + d.day + " 天 · " + d.date.slice(5).replace("-", "/") + " " + d.wd,
      done + "/" + d.tasks.length + " 已完成"))
    SUBS.forEach(k => {
      const ts = d.tasks.filter(x => x.sub === k)
      if (!ts.length) return
      t.addRow(head(SUB[k].name, ts.filter(x => S.done[tid(x)]).length + "/" + ts.length))
      taskRows(t, P, S, { date: d.date, tasks: ts }, render)
    })
    t.reload()
  }
  render()
  return t
}

function mainTable(P, S) {
  const iso = todayISO()
  const d = dayOf(P, iso)
  const t = new UITable()
  t.showSeparators = false

  const render = () => {
    t.removeAllRows()
    if (d) {
      t.addRow(head("今日 · 第 " + d.day + " 天",
        d.date.slice(5).replace("-", "/") + " " + d.wd + " · 点一下打勾，可上下滑动"))
      taskRows(t, P, S, d, render)
    }
    const st = stats(P, S)
    const sr = mrow("总进度 " + st.pct + "%", "已完成 " + st.done + " / " + st.total + " 项 · 全部 " + P.days.length + " 天")
    sr.backgroundColor = new Color("#1C1C1E")
    t.addRow(sr)

    t.addRow(head("全部日程", "点某一天查看详情"))
    P.days.forEach(day => {
      const done = day.tasks.filter(x => S.done[tid(x)]).length
      const mark = day.date === iso ? "▸ " : "   "
      const r = mrow(mark + "D" + day.day + "  " + day.date.slice(5).replace("-", "/") + " " + day.wd,
        done + "/" + day.tasks.length + " · " + day.min + " 分钟" + (day.date === iso ? " · 今天" : ""))
      r.dismissOnSelect = false
      r.onSelect = async () => {
        await dayTable(P, S, day).present(true)
        render()
      }
      t.addRow(r)
    })
    t.reload()
  }
  render()
  return t
}

/* ---------- 入口 ---------- */
const S = loadProg()
const P = await loadPlan()

if (config.runsInWidget) {
  Script.setWidget(buildWidget(P, S))
  Script.complete()
} else {
  if (!P) {
    const a = new Alert()
    a.title = "排期加载失败"
    a.message = "还没有本地缓存，也没有网络。请连上网后重新运行一次。"
    a.addAction("好")
    await a.present()
  } else {
    await mainTable(P, S).present(true)
  }
  Script.complete()
}

