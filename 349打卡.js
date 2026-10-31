// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic;
(async () => {
  // 349三科打卡 · Scriptable 小组件 + 可滑动清单
  // ⚠️ 改完这个文件后，不要在 iPhone 的 Scriptable 里打开脚本编辑器，
  //    否则它会用手机上的旧副本回写，把这里的改动覆盖掉。
  // 数据源：https://1123user.github.io/349-checkin/plan3.json（本地缓存兜底）
  // 进度存 iCloud Drive：Scriptable/349打卡/progress.json（两设备自动同步）
  
  const BASE = "https://1123user.github.io/349-checkin/"
  const fm = FileManager.iCloud()
  const DIR = fm.joinPath(fm.documentsDirectory(), "349打卡")
  const F_PLAN = fm.joinPath(DIR, "plan3.json")
  const F_PROG = fm.joinPath(DIR, "progress.json")
  const F_AI = fm.joinPath(DIR, "ai.json")   // Mac 端每晚 21:00 预生成的 AI 寄语（含明天那条；组件只读）
  
  /* 运行留痕：把「哪一版 / 什么时候 / 什么尺寸跑过」写进 iCloud Drive：Scriptable/349打卡/run-log.txt。
     同一个 BUILD 只写一次，平时不产生任何写入。手机到底跑的是哪一版，在 Mac 上一眼就能看到，
     不用再来回截图。 */
  const BUILD = "v3-20261017-ai"
  function trace(tag) {
    try {
      const p = fm.joinPath(DIR, "run-log.txt")
      let old = ""
      try { old = fm.readString(p) } catch (e) {}
      if (old.indexOf(BUILD) === 0) return
      fm.writeString(p, new Date().toISOString().slice(5, 16).replace("T", " ") + "  " +
        BUILD + "  " + tag + "  " + (config.widgetFamily || "app") + "\n" + old)
    } catch (e) {}
  }
  
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
  let PROG_OK = false
  async function loadProg() {
    try {
      if (fm.fileExists(F_PROG)) {
        await ready(F_PROG)          // iCloud 占位文件必须先下载，否则读不到
        const o = JSON.parse(fm.readString(F_PROG))
        PROG_OK = true
        if (o && o.done) return o
      } else {
        PROG_OK = true               // 文件不存在 = 全新开始，允许写入
      }
    } catch (e) {
      PROG_OK = false                // 读失败就锁死写入，避免把真实进度覆盖成空
    }
    return { done: {} }
  }
  function saveProg(p) {
    if (!PROG_OK) return false
    ensureDir()
    fm.writeString(F_PROG, JSON.stringify(p))
    return true
  }
  /* patch-robust-20261031 双源 + 超时放宽 + 手机本地兜底 */
  function planOk(o) { return !!(o && o.days && o.days.length) }
  async function loadPlan() {
    let cached = null
    try {
      if (fm.fileExists(F_PLAN)) { await ready(F_PLAN); cached = JSON.parse(fm.readString(F_PLAN)) }
    } catch (e) {}
    if (planOk(cached)) return cached
    const fml = FileManager.local()
    const dirL = fml.joinPath(fml.documentsDirectory(), "349打卡")
    const pL = fml.joinPath(dirL, "plan3.json")
    try {
      if (fml.fileExists(pL)) { const o = JSON.parse(fml.readString(pL)); if (planOk(o)) return o }
    } catch (e) {}
    const SRC = [BASE + "plan3.json", "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/plan3.json"]
    for (const u of SRC) {
      try {
        const r = new Request(u)
        r.timeoutInterval = 15
        const fresh = await r.loadJSON()
        if (planOk(fresh)) {
          try { ensureDir(); fm.writeString(F_PLAN, JSON.stringify(fresh)) } catch (e) {}
          try {
            if (!fml.fileExists(dirL)) fml.createDirectory(dirL, true)
            fml.writeString(pL, JSON.stringify(fresh))
          } catch (e) {}
          return fresh
        }
      } catch (e) {}
    }
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
  
  /* 去掉与课号重复的前缀（[L5-2] Lecture 5-2 … / [第三讲] 第三讲：…） */
  function stripPrefix(s) {
    return String(s)
      .replace(/^Lecture\s*\d+\s*-\s*\d+\s*/i, "")
      .replace(/^第[一二三四五六七八九十百]+讲[：:\s]*/, "")
  }
  
  /* 小组件用的短标题：再去掉 B站标题的尾巴与口水词 */
  function shortTitle(t) {
    let s = stripPrefix(t.title).replace(/^【[^】]*】\s*/, "")
    const noise = /^(带你背诵|期末复习|考研|学习分享|药理学背诵|必看|考点)/
    const segs = s.split(/[｜|]/).map(x => x.trim()).filter(x => x && !noise.test(x))
    s = segs.length ? segs[0] : s
    return s.length > 22 ? s.slice(0, 22) + "…" : s
  }
  
  /* 按字数截断：小号组件一行放不下整句寄语（实测一行 ~12 个汉字到边） */
  function shrink(s, n) {
    s = String(s || "")
    return s.length > n ? s.slice(0, n) + "…" : s
  }
  
  /* ---------- 圆环：Path 没有 addArc，用 36 段折线逼近 ---------- */
  /* 只用官方文档里确实存在的 API：Path.addLines(points) 会自己从第一个点起步。
     ⚠️ 不要用 moveTo —— Scriptable 的 Path 没有 moveTo（只有 move），调用即抛
     TypeError，小组件会直接显示一堆红字。2026-10-16 踩过。 */
  function arcPath(cx, cy, r, from, to) {
    const N = 36, pts = []
    for (let i = 0; i <= N; i++) {
      const a = from + (to - from) * (i / N)
      pts.push(new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
    const p = new Path()
    p.addLines(pts)
    if (to - from >= Math.PI * 2 - 0.001) p.closeSubpath()
    return p
  }
  function drawRing(pct, color, size, sw, label) {
    const dc = new DrawContext()
    dc.size = new Size(size, size)
    dc.opaque = false
    dc.respectScreenScale = true   // 只有这个属性，没有 respectFlipped
    const r = (size - sw) / 2, c = size / 2
    dc.setStrokeColor(new Color("#FFFFFF", 0.15))
    dc.setLineWidth(sw)
    dc.addPath(arcPath(c, c, r, -Math.PI / 2, Math.PI * 1.5))
    dc.strokePath()
    const f = Math.max(0, Math.min(100, pct)) / 100
    if (f > 0.002) {
      dc.setStrokeColor(color)
      dc.setLineWidth(sw)
      dc.addPath(arcPath(c, c, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f))
      dc.strokePath()
    }
    if (label) {
      dc.setTextColor(color)
      dc.setFont(Font.boldSystemFont(size <= 34 ? 8 : 14))
      dc.setTextAlignedCenter()
      dc.drawTextInRect(label, new Rect(0, c - size * 0.17, size, size * 0.34))
    }
    return dc.getImage()
  }
  
  /* ---------- AI 文字：Mac 端每天预生成写进 iCloud，组件只读（读不到就用内置池） ---------- */
  /* 内置兜底池：按「角度」分组，每天换一组（8 天一轮），组内再按天取一条。
     之前是 28 条平铺，连着几天很容易撞到同一种句式；分组后同一角度至少隔 8 天。 */
  /* 人设：小满（甜妹学习小管家）。这里的池子与 Mac 端 tools/ai_daily.py 的
     PERSONA / LOCAL_POOL 同一口径——语气词 + 陪伴小动作，内容仍然具体。 */
  const AI_FALLBACK = {
    action: ["宝，先挑最短的那节开头嘛", "先把昨天折角那页翻开，我等你",
             "今天从最不想看的那科起手哦", "先写个日期，咱们就开第一条",
             "换一科吧，从中间插进去也行", "桌面清出块地方，我就坐这儿",
             "昨天划掉的最后一条，接上它", "今天只挑两节，剩下的我替你排"],
    trap:   ["单位先写下，别我提醒你哦", "有效数字那几位，最容易白丢",
             "波数记个范围就够，别死磕啦", "正负号、方向、顺序，先看这三样",
             "两个长得像的概念，先分清嘛", "题目里那个「不正确」，看见没",
             "公式先写再代，别在脑子里算呀", "名字记混就回结构上看，我陪你"],
    memory: ["拿今天这节跟上一节对着记呀", "画一条线，比抄三段管用哦",
             "只记范围，别记死数字啦", "念一遍给我听，念顺就是会了",
             "把三个例外单独抄一张纸上嘛", "先看图再看字，顺序别反哦",
             "记不住就编个自己的说法，我信你", "同类摆一排，差别只在那一处"],
    drill:  ["先做题嘛，错了再回去看那节", "卡住就标个问号，往下走哦",
             "错题先讲给我听，再对答案", "同一类错两次，单开一页记它",
             "做完马上回看，别等隔天啦", "先看选项再读题，能省一半时间",
             "拿不准的跳过，回头再看一遍嘛", "多待三分钟，比翻答案强哦"],
    pace:   ["这点量分两段，中间起来晃一下", "难的放脑子最清的时候，好不好",
             "别一口气赶完，留点给明天嘛", "短的先做完，长的慢慢啃哦",
             "看满四十分钟就换一科呀", "今天少排一点，做扎实就行啦",
             "晚上状态差，就只做回想吧", "慢一点没关系，别断了就行哦"],
    review: ["昨天没懂的那节，今天补掉嘛", "合上书回想十秒，再说看完了",
             "前天的错题翻一遍，再开新的哦", "昨天划的那条，讲一遍给我听呀",
             "周末不学新的，只回头看看", "本子上那些疑问，今天解决两个",
             "回头看一遍，比赶新的记得久哦", "昨天漏的，今天补回来好不好"],
    mood:   ["不在状态就少做点，我不催你", "学不进去就先承认它，没事的",
             "慢一点没关系呀，别跟别人比", "烦躁就换个科目，比硬撑好哦",
             "做完今天这点，就算数啦", "不用每天都高效，稳稳的就行",
             "心里没底正常，我陪你接着做", "别为昨天没做完的事补账呀"],
    body:   ["困了就站起来走两步，我等你", "手机搁远一点点，就一点点哦",
             "坐久了肩会僵，抬一下再继续呀", "喝口水吧，眼睛也歇一小会儿",
             "走神就倒回去十秒，不用重看哦", "眼睛酸就先看字少的那节啦",
             "晚上别熬呀，明天还得接着来", "脑子转不动就先抄，手会带脑子"],
  }
  /* 天数序号取模：组按天轮换（8 组），组内再按天取，相邻两天必然不同 */
  function fallbackAI() {
    const dayIdx = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)
    const keys = Object.keys(AI_FALLBACK)
    const g = AI_FALLBACK[keys[dayIdx % keys.length]]
    return g[Math.floor(dayIdx / keys.length) % g.length]
  }
  async function loadAI(d) {
    try {
      if (fm.fileExists(F_AI)) {
        await ready(F_AI)
        const o = JSON.parse(fm.readString(F_AI))
        const t = todayISO()
        /* 新格式：Mac 每晚 21:00 生成「明天」那句，写进 quotes 表（今天、明天同时在），
           所以 0 点一过组件自然就取到新的一句，不用等 Mac 醒来再跑。 */
        const q = o && o.quotes ? o.quotes[t] : null
        if (q && typeof q.text === "string" && q.text.trim()) return q
        /* 旧格式兜底：只有顶层 text/date 的文件。只认当天的，
           免得 Mac 停了一天没生成、昨天的句子接着用，那就不叫每天变化了。 */
        if (o && typeof o.text === "string" && o.text.trim() && o.date === t) return o
      }
    } catch (e) {}
    return { text: fallbackAI(), src: "local" }
  }
  
  /* ---------- 小组件 ---------- */
  /* 头部：第 N 天 + 日期 + 今日进度（不显示倒计时/考试日期） | 右侧三科进度圆环 */
  function widgetHead(w, P, S, d) {
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
  
    const lf = row.addStack()
    lf.layoutVertically()
    const t1 = lf.addText(d ? "第 " + d.day + " 天" : "已收口")
    t1.font = Font.boldSystemFont(18)
    t1.textColor = TXT
    const dc = d ? d.tasks.filter(t => S.done[tid(t)]).length : 0
    const t2 = lf.addText(d ? d.date.slice(5).replace("-", "/") + " " + d.wd + " · " + dc + "/" + d.tasks.length + " 条" : "阶段一结束")
    t2.font = Font.mediumSystemFont(9)
    t2.textColor = DIM
  
    row.addSpacer()
  
    const rings = row.addStack()
    rings.layoutHorizontally()
    rings.centerAlignContent()
    rings.spacing = 7
    SUBS.forEach(k => {
      const ss = subStat(P, S, k, d)
      const g = rings.addStack()
      g.layoutHorizontally()
      g.centerAlignContent()
      g.spacing = 4
      g.addImage(drawRing(ss.pct, SUB[k].c, 30, 3, ss.pct + "%"))
      const col = g.addStack()
      col.layoutVertically()
      const nm = col.addText(SUB[k].name)
      nm.font = Font.semiboldSystemFont(9.5)
      nm.textColor = SUB[k].c
      const ct = col.addText(ss.done + "/" + ss.n)
      ct.font = Font.mediumSystemFont(8.5)
      ct.textColor = DIM
    })
    return d
  }
  
  /* 任务行：整行点一下直通 B站；底部一张 AI 文字卡 */
  function widgetTasks(w, P, S, d, maxN, ai) {
    const list = d.tasks.filter(t => !S.done[tid(t)])
    const shown = (list.length ? list : d.tasks).slice(0, maxN)
    const rest = list.length ? list.length - shown.length : 0
  
    const rows = w.addStack()
    rows.layoutVertically()
    rows.spacing = 2
    if (!list.length) {
      const t = rows.addText("今天全部打完了 ✓")
      t.font = Font.semiboldSystemFont(12)
      t.textColor = new Color("#30D158")
    }
    shown.forEach(t => {
      const on = !!S.done[tid(t)]
      const r = rows.addStack()
      r.layoutHorizontally()
      r.centerAlignContent()
      r.url = t.url                                  // 整行点一下 = 直通 B站
      const dot = r.addText(on ? "✓" : "○")
      dot.font = Font.boldSystemFont(10)
      dot.textColor = on ? new Color("#30D158") : SUB[t.sub].c
      r.addSpacer(4)
      const tx = r.addText(t.key + " " + shortTitle(t))
      tx.font = Font.systemFont(10.5)
      tx.textColor = on ? new Color("#30D158") : new Color("#D1D1D6")
      tx.lineLimit = 1
      r.addSpacer(4)
      const b = r.addText("▶ B站")
      b.font = Font.semiboldSystemFont(9)
      b.textColor = new Color("#0A84FF")
    })
  
    w.addSpacer(3)
    const card = w.addStack()
    card.layoutHorizontally()
    card.centerAlignContent()
    card.spacing = 5
    card.backgroundColor = new Color("#FFFFFF", 0.06)
    card.cornerRadius = 9
    card.setPadding(4, 7, 4, 7)
    card.url = "scriptable:///run/" + encodeURIComponent(Script.name())
    const sp = card.addText("✦")
    sp.font = Font.boldSystemFont(9.5)
    sp.textColor = new Color("#FF9F0A")
    const tx = card.addText(ai.text)
    tx.font = Font.systemFont(10)
    tx.textColor = new Color("#EDEDF0")
    tx.lineLimit = 1
    card.addSpacer()
    if (rest > 0) {
      const m = card.addText("还 " + rest + " 条 →")
      m.font = Font.semiboldSystemFont(9)
      m.textColor = new Color("#0A84FF")
    }
  }
  
  async function buildWidget(P, S) {
    const fam = config.widgetFamily || "medium"
    const iso = todayISO()
    const w = new ListWidget()
    w.setPadding(12, 15, 12, 15)
    const g = new LinearGradient()
    g.colors = [new Color("#1C1C1E"), new Color("#0A0A0C")]
    g.locations = [0, 1]
    w.backgroundGradient = g
    w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
  
    if (!P) {
      w.addSpacer()
      const t = w.addText("排期加载失败，请在有网时打开一次")
      t.font = Font.systemFont(12)
      t.textColor = DIM
      w.addSpacer()
      return w
    }
  
    const d = dayOf(P, iso)
    const runURL = "scriptable:///run/" + encodeURIComponent(Script.name())
  
    /* 小号：只放「第 N 天 + 日期 + 今日进度环」，整块点开进清单（系统只给一个点击目标） */
    if (fam === "small") {
      /* 小号：第 N 天 + 日期 + 今日完成环 + AI 寄语。
         环里已经写了 done/total，所以不再重复那句「3 科 · 今天 n 条」——
         省下的高度全部给寄语，环恢复 72pt，内容整体上移，底部留两行给它。 */
      w.addSpacer(2)          // 固定小间距（不用弹性弹簧，否则整块会垂直居中）
      w.url = runURL
      const t1 = w.addText(d ? "第 " + d.day + " 天" : "已收口")
      t1.font = Font.semiboldSystemFont(11)
      t1.textColor = DIM
      t1.centerAlignText()
      const t2 = w.addText(d ? d.date.slice(5).replace("-", "/") + " " + d.wd : "")
      t2.font = Font.mediumSystemFont(9.5)
      t2.textColor = DIM
      t2.centerAlignText()
      const done = d ? d.tasks.filter(t => S.done[tid(t)]).length : 0
      const total = d ? d.tasks.length : 0
      w.addSpacer(6)
      const c = w.addStack()
      c.layoutHorizontally()
      c.addSpacer()
      c.addImage(drawRing(total ? Math.round(done / total * 100) : 0, new Color("#FF9F0A"), 72, 6, done + "/" + total))
      c.addSpacer()
      w.addSpacer()           // 弹性弹簧：把寄语压到底部，上半部分自然上移
      const ai = await loadAI(d)
      const t3 = w.addText("✦ " + shrink(ai.text, 26))
      t3.font = Font.systemFont(10)
      t3.textColor = new Color("#C7C7CC")
      t3.lineLimit = 2
      t3.centerAlignText()
      return w
    }
  
    /* 中号 / 大号：头部 + 任务行（整行可点直通 B站）+ AI 文字卡 */
    widgetHead(w, P, S, d)
    w.addSpacer(5)
    if (d) {
      const ai = await loadAI(d)
      widgetTasks(w, P, S, d, fam === "large" ? 12 : 5, ai)
    } else {
      const t = w.addText("这个阶段已经收口了")
      t.font = Font.systemFont(11)
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
        (on ? "✓ " : "○ ") + "[" + task.key + "] " + stripPrefix(task.title),
        SUB[task.sub].name + " · " + task.dur + " · " + task.level + (task.note ? " · " + task.note : ""),
        on ? new Color("#30D158") : SUB[task.sub].c
      )
      r.dismissOnSelect = false
      r.onSelect = () => {
        if (on) delete S.done[tid(task)]; else S.done[tid(task)] = Date.now()
        saveProg(S)
        rerender()
      }
      const b = r.addButton("▶ B站")
      b.titleColor = new Color("#0A84FF")
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
  trace("start")
  const S = await loadProg()
  const P = await loadPlan()
  
  if (config.runsInWidget) {
    /* 组件里出错时不要糊一屏红色堆栈：兜成一行可读提示，并把错误写进 run-log.txt */
    let w
    try {
      w = await buildWidget(P, S)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      trace("ERROR " + msg)
      w = new ListWidget()
      const t = w.addText("脚本出错：\n" + msg)
      t.font = Font.systemFont(11)
      t.textColor = new Color("#FF453A")
    }
    Script.setWidget(w)
    Script.complete()
  } else {
    if (!P) {
      const a = new Alert()
      a.title = "排期加载失败"
      a.message = "还没有本地缓存，也没有网络。请连上网后重新运行一次。"
      a.addAction("好")
      await a.present()
    } else {
      if (!PROG_OK) {
        const a = new Alert()
        a.title = "进度文件还没同步下来"
        a.message = "iCloud 里的 progress.json 还没下载完，这次先看排期；为避免覆盖，打勾暂时不保存。稍后再运行一次即可。"
        a.addAction("知道了")
        await a.present()
      }
      await mainTable(P, S).present(true)
    }
    Script.complete()
  }
  
})()
