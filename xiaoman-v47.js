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
  const fm = FileManager.local()   /* v62：本机存储 —— iCloud 容器抛的是原生异常，JS 无法捕获，只能完全不碰 */
  const DIR = fm.joinPath(fm.documentsDirectory(), "349打卡")
  const F_PLAN = fm.joinPath(DIR, "plan3.json")
  const F_REC = fm.joinPath(DIR, "rec.json")        // 今日视频推荐（tools/recommend.py）
  const F_TMR = fm.joinPath(DIR, "tomorrow.json")   // 明天的安排（云端 cloud/tomorrow.py）
  const F_KB = fm.joinPath(DIR, "kb.json")          // 药学助教知识库（cloud/build_kb.py 生成，手机本地缓存）
  const F_PROG = fm.joinPath(DIR, "progress.json")
  /* 本地兜底（2026-10-30）：iCloud 没下载完 / 写不上去时，勾选先落到手机本地，
     下次运行自动并回 progress.json。原来这种时候是静默不保存 ——
     表现就是「点一下变绿，关掉再进来又没了」✗ */
  const fml = FileManager.local()
  const DIR_L = fml.joinPath(fml.documentsDirectory(), "349打卡")
  const F_PEND = fml.joinPath(DIR_L, "pending.json")
  const F_AI = fm.joinPath(DIR, "ai.json")   // Mac 端每晚 21:00 预生成的 AI 寄语（含明天那条；组件只读）
  const F_EN = fm.joinPath(DIR, "plan-en.json")   // 英语 8 周日程缓存（与药学同一个组件里显示）
  const F_RV = fm.joinPath(DIR, "en-review.json")       // 昨日阅读复盘（Mac 端 tools/make_en_review.py 生成）
  const F_RVSEEN = fm.joinPath(DIR, "en-review-seen.json")  // 复盘看到哪一天了
  const F_CD = fm.joinPath(DIR, "cloze-daily.json")      // 完形每日三空（tools/make_cloze_daily.py）
  const F_POL = fm.joinPath(DIR, "plan-pol.json") // 政治 54 天冲刺日程（10/26–12/18）
  
  /* 运行留痕：把「哪一版 / 什么时候 / 什么尺寸跑过」写进 iCloud Drive：Scriptable/349打卡/run-log.txt。
     同一个 BUILD 只写一次，平时不产生任何写入。手机到底跑的是哪一版，在 Mac 上一眼就能看到，
     不用再来回截图。 */
  const BUILD = "v67-20261107-diag"
  /* 英语播放一律交给新东方 App（2026-10-25 定稿）：网页端有的课有回放、单词课没入口，
     App 深链三种写法都不认、App 里也没有搜索框。所以小满只负责说明"今天看哪节课"。 */
  /* 立绘（2026-11-01 改）：原来是一段 182KB 的 base64 直接写死在脚本里，
     把脚本源码撑到 282KB —— Scriptable 每次运行（组件也一样）都要先把整份源码读进来编译，
     这才是「点开要等一下」的大头。现在立绘单独存成 349打卡/pet.png（136KB）：
     手机本地缓存优先，其次 iCloud，两边都没有就先不画，下一轮自动补上。 */
  let _pet = null
  function petImage() {
    if (_pet) return _pet
    try {
      /* ① 手机本地缓存（最快，不经过 iCloud） */
      const lp = fml.joinPath(DIR_L, "pet.png")
      if (fml.fileExists(lp)) { _pet = Image.fromFile(lp); if (_pet) return _pet }
      /* ② iCloud 上的 349打卡/pet.png */
      const p = fm.joinPath(DIR, "pet.png")
      if (fm.fileExists(p)) {
        if (false) {
          try { fm.downloadFileFromiCloud(p) } catch (e) {}   /* 后台下，下一轮就有 */
          return null
        }
        _pet = Image.fromFile(p)
        if (_pet) {
          try {
            if (!fml.fileExists(DIR_L)) fml.createDirectory(DIR_L, true)
            fml.write(lp, Data.fromFile(p))
          } catch (e) {}
          return _pet
        }
      }
    } catch (e) { _pet = null }
    return _pet
  }

  /* ---------- 启动监测（v67-20261107）----------
     手机上看不到 Log 面板，出错只有一个「卡在哪一步」。
     现在启动链每一步都记一条（步骤 + 耗时 + 错误原文）：
     ① 启动出错时直接把明细弹在弹窗里；② 正常时进「⚙ 设置 → 🩺 启动监测」看；
     ③ 同时追加到手机本地 xm-diag.log（FileManager.local，完全不碰 iCloud）。 */
  const DIAG = []
  const DIAG_MAX = 48
  function diagPath() { return fml.joinPath(fml.documentsDirectory(), "xm-diag.log") }
  function diag(tag, t0, err) {
    let ms = "-"
    try { if (t0) ms = (Date.now() - t0) + "ms" } catch (e) {}
    let em = ""
    try { em = err ? String((err && err.message) || err || "").replace(/[\r\n]+/g, " ").slice(0, 140) : "" } catch (e) {}
    let line = ""
    try { line = new Date().toTimeString().slice(0, 8) + " " + tag + "  " + ms + (em ? "  ✗ " + em : "") } catch (e) { line = tag }
    try { DIAG.push(line); while (DIAG.length > DIAG_MAX) DIAG.shift() } catch (e) {}
    try {
      let old = ""
      try { if (fml.fileExists(diagPath())) old = String(fml.readString(diagPath()) || "") } catch (e) {}
      const all = (line + "\n" + old).split("\n").filter(x => x.trim()).slice(0, DIAG_MAX)
      fml.writeString(diagPath(), all.join("\n"))
    } catch (e) {}
    return line
  }
  /* 启动监测面板：本次运行的每一步 + 手机本地落盘记录（重启后还看得到） */
  async function diagSheet() {
    const t = new UITable()
    t.showSeparators = false
    let old = ""
    try { if (fml.fileExists(diagPath())) old = String(fml.readString(diagPath()) || "") } catch (e) {}
    const disk = old.split("\n").filter(x => x.trim())
    const put = (txt, bad, dim) => {
      const r = new UITableRow()
      r.dismissOnSelect = false
      const c = r.addText(txt)
      c.titleFont = Font.systemFont(11)
      c.titleColor = bad ? new Color("#FF453A") : (dim ? new Color("#8E8E93") : new Color("#1C1C1E"))
      t.addRow(r)
    }
    const h = new UITableRow()
    h.dismissOnSelect = false
    h.addText("🩺 启动监测")
    h.addText(BUILD + "\n本次 " + DIAG.length + " 步 · 落盘 " + disk.length + " 条")
    t.addRow(h)
    if (!DIAG.length) put("本次还没记录（脚本刚起来就点进来了）", false, true)
    DIAG.slice().reverse().forEach(x => put(x, x.indexOf("✗") >= 0, x.indexOf("✗") < 0))
    const rest = disk.filter(x => DIAG.indexOf(x) < 0)
    if (rest.length) {
      put("—— 落盘记录 · 手机本地 xm-diag.log ——", false, true)
      rest.slice(0, 20).forEach(x => put(x, x.indexOf("✗") >= 0, x.indexOf("✗") < 0))
    }
    await t.present(true)
  }
  function trace(tag) {
    try {
      /* 启动提速：先用手机本地的标记判断「这一版已经留过痕」，
         省掉每次开小满都去读一次 iCloud 的 run-log.txt（iCloud 读是同步阻塞的）。 */
      let mk = ""
      try {
        if (!fml.fileExists(DIR_L)) fml.createDirectory(DIR_L, true)
        mk = fml.joinPath(DIR_L, ".traced")
        if (fml.fileExists(mk) && String(fml.readString(mk) || "").indexOf(BUILD) === 0) return
      } catch (e) {}
      const p = fm.joinPath(DIR, "run-log.txt")
      let old = ""
      try { if (fm.fileExists(p)) old = fm.readString(p) || "" } catch (e) {}
      /* fileExists 先探（2026-11-05）：新装机/新 BUILD 时 run-log.txt 还不存在，
         直接 readString 会抛「does not exist」—— 功能没影响（catch 住了），
         但 Scriptable 会把它打在 Log 面板上，看着像出错，静默掉。 */
      if (old.indexOf(BUILD) === 0) return
      fm.writeString(p, new Date().toISOString().slice(5, 16).replace("T", " ") + "  " +
        BUILD + "  " + tag + "  " + (config.widgetFamily || "app") + "\n" + old)
      try { if (mk) fml.writeString(mk, BUILD) } catch (e) {}
    } catch (e) {}
  }

  /* 启动耗时留痕（2026-11-01）：写进 iCloud Drive：Scriptable/349打卡/boot-log.txt，最近 25 行。
     手机上没法打断点，「到底是哪一步慢」全靠这个文件看：
       load = 读进度/排期/英语/政治（iCloud 下载 + JSON 解析）
       pull = 拉云端三个 json（tomorrow / kb / rec）
       show = 从数据齐了到清单弹出（渲染） */
  function bootLog(t0, tLoad, tPull, tShow, tag) {
    try {
      ensureDir()
      const p = fm.joinPath(DIR, "boot-log.txt")
      let old = ""
      try { if (fm.fileExists(p)) old = fm.readString(p) || "" } catch (e) {}
      const ms = (a, b) => (a && b) ? (b - a) + "ms" : "-"
      const line = new Date().toISOString().slice(5, 16).replace("T", " ") + "  " + BUILD +
        "  load=" + ms(t0, tLoad) + " pull=" + ms(tLoad, tPull) + " show=" + ms(tPull, tShow) +
        " total=" + ms(t0, tShow || tPull) + " " + (config.widgetFamily || "app") + (tag ? " " + tag : "")
      fm.writeString(p, ([line].concat(old.split("\n"))).slice(0, 25).join("\n"))
    } catch (e) {}
  }
  
  const SUBS = ["org", "pharm", "ana"]
  /* 三科色在紫底上各提亮一档，原来的正红/正蓝压暗底会发脏 */
  const SUB = {
    org:   { name: "有机", c: new Color("#F2A65A") },
    pharm: { name: "药理", c: new Color("#F0CE6B") },
    ana:   { name: "分析", c: new Color("#7FA8E8") },
    pol:   { name: "政治", c: new Color("#FF6B5E") },
  }

  /* ---------- 配色：全套从立绘里取色，组件里不再出现别的色系 ----------
     立绘主色 #E0E0F0（淡紫白）/ 暗部 #404080（靛紫）/ 腮红 #FF7FA0。
     背景是「夜里图书馆靠窗那盏灯」：紫罗兰→墨夜的三段渐变，不是纯黑。 */
  const TH = {
    bgTop:  new Color("#3B2E5A"),
    bgMid:  new Color("#251D3C"),
    bgLow:  new Color("#16121F"),
    head:   new Color("#D9D2F2"),      /* 头部主字 */
    sub:    new Color("#A79FC4"),      /* 次要字 */
    ring:   new Color("#B49CFF"),      /* 进度环 */
    ringTx: new Color("#CBB9FF"),      /* 环旁计数 */
    pink:   new Color("#FF7FA0"),      /* 星星 / 强调 */
    bubBg:  new Color("#FFFCF8", 0.97),/* 气泡暖白，不带冷灰 */
    bubTx:  new Color("#2B2540"),      /* 气泡字：墨紫不是纯黑 */
    card:   new Color("#FFFFFF", 0.10),
    ok:     new Color("#6FE0A6"),      /* 完成 */
    link:   new Color("#8FB8FF"),      /* B站 */
    en:     new Color("#5CD39B"),      /* 英语：青绿，跟三科的红/琥珀/蓝都分得开 */
    halo:   "#B49CFF",                 /* 立绘柔光 */
  }
  const DIM = TH.sub
  const TXT = new Color("#F4F0FF")

  /* 清单（UITable）是系统底色，白底上浅粉浅紫几乎看不见（2026-10-25 反馈）。
     这里按系统外观给一套清单专用色：暗色用亮色、浅色用深色。
     小组件永远是暗紫底，继续用 TH，不受影响。 */
  const darkUI = (() => { try { return Device.isUsingDarkAppearance() } catch (e) { return true } })()
  const TC = {
    txt:   darkUI ? new Color("#F4F0FF") : new Color("#1A1A1F"),
    dim:   darkUI ? new Color("#A79FC4") : new Color("#6A6A72"),
    ok:    darkUI ? new Color("#6FE0A6") : new Color("#1E7B4F"),
    link:  darkUI ? new Color("#8FB8FF") : new Color("#2563C9"),
    /* 五个主体色：政治正红(4°) / 有机赭橙(35°) / 药理金(43°) / 英语绿(155°) / 分析钢蓝(215°)
       —— 去掉紫色后，暖色一头（政治红 + 药学橙金）靠明度差分开，冷色一头只有绿和蓝，
       全表只有一个绿（英语），不会再出现两行都是绿看不出区别的情况。 */
    org:   darkUI ? new Color("#F2A65A") : new Color("#C97B2E"),
    pharm: darkUI ? new Color("#F0CE6B") : new Color("#D9A93B"),
    ana:   darkUI ? new Color("#7FA8E8") : new Color("#3E6FB0"),
    en:    darkUI ? new Color("#5CD39B") : new Color("#2E9E6B"),
    pol:   darkUI ? new Color("#FF6B5E") : new Color("#C0392B"),
  }
  
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
  /* 启动提速（2026-11-01）：downloadFileFromiCloud 在 JSContext 里是同步阻塞的，
     文件越大、iCloud 越忙越久，而且 Promise.race 也打不断它 —— 所以只能「少等、不等」。
     bg=true：只把下载扔后台，本次先用别的兜底（或干脆不显示这一块），
     下次进来（组件 20 分钟一刷）自然就是新的。进度这种关键数据仍然老老实实等。 */
  async function ready(path, bg) {
    if (false) {
      if (bg) {
        try { fm.downloadFileFromiCloud(path) } catch (e) {}
        return false
      }
      await fm.downloadFileFromiCloud(path)
    }
    return true
  }
  
  /* ---------- 数据 ---------- */
  let PROG_OK = false
  let PROG_BASE = null            // loadProg 时的 done 快照，saveProg 做三方合并用
  /* 本地兜底文件：{"done": {...}}，只在写不进 iCloud 时才有内容 */
  function pendRead() {
    try {
      if (fml.fileExists(F_PEND)) return JSON.parse(fml.readString(F_PEND)) || {}
    } catch (e) {}
    return {}
  }
  function pendWrite(done) {
    try {
      if (!fml.fileExists(DIR_L)) fml.createDirectory(DIR_L, true)
      fml.writeString(F_PEND, JSON.stringify({ done: done, at: Date.now() }))
      return true
    } catch (e) { return false }
  }
  function pendClear() {
    try { if (fml.fileExists(F_PEND)) fml.remove(F_PEND) } catch (e) {}
  }
  /* 合并规则：同一 key 取**较新的时间戳**；只增不删（取消勾选以 iCloud 为准） */
  function mergeInto(base, extra) {
    for (const k in extra) {
      const v = extra[k] || 0
      if (!base[k] || v > base[k]) base[k] = v
    }
  }

  /* 三方合并：base=打开时快照 / mine=内存现值 / theirs=云端最新
     我新增的→保留，我删掉的→删掉，别人新增的→保留，冲突取较新时间戳。
     解决「手机打开得早、Mac 又勾了新条目，手机一勾就把 Mac 的勾写没」的问题。 */
  function merge3(base, mine, theirs) {
    const out = {}
    for (const k in theirs) out[k] = theirs[k]
    for (const k in base) if (!(k in mine)) delete out[k]
    for (const k in mine) { const v = mine[k] || 0; if (!out[k] || v > out[k]) out[k] = v }
    return out
  }

  /* —— 局域网直推 Mac（2026-11-06）：iCloud 手机→Mac 通道整天卡死过，
     勾选停手 2.5s 后直接 POST 到 Mac 本机服务，秒级同步；失败静默回落 iCloud —— */
  const MAC_TOKEN = "xiaoman-349"
  let RECENT_DEL = {}              // 本次会话里取消勾选的键（Mac 端按时间戳决定是否删）
  /* Scriptable 没有 setTimeout，用 Timer 包一个（给网络总超时用） */
  function lanDelay(sec) {
    return new Promise(res => { try { Timer.schedule(sec, () => res(1)) } catch (e) { res(0) } })
  }

  /* v63：Mac 的局域网服务地址写死 —— 排期/进度/AI 寄语/立绘全部从这台 Mac 取，
     勾选也直接 POST 回去。不需要 token、不走外网、不碰 iCloud。 */
  const LAN = "http://172.20.10.6:8878"
  const LAN_FILES_FULL = ["plan3.json", "plan-en.json", "plan-pol.json", "ai.json", "rec.json",
                          "en-review.json", "cloze-daily.json", "player.json", "tomorrow.json"]
  const LAN_FILES_QUICK = ["ai.json", "rec.json"]

  /* 把 Mac 上的数据文件搬到手机本机（之后原有代码照常读本机文件，逻辑一行不改） */
  async function prefetchLAN(quick) {
    try { ensureDir() } catch (e) {}
    const list = quick ? LAN_FILES_QUICK : LAN_FILES_FULL
    const jobs = list.map(f => (async () => {
      try {
        const r = new Request(LAN + "/" + f)
        r.timeoutInterval = quick ? 5 : 8
        const t = await r.loadString()
        if (t && t.length > 20) fm.writeString(fm.joinPath(DIR, f), t)
      } catch (e) {}
    })())
    /* 本机缺今天排期时，即使是组件也要补拉一次三件套 */
    if (quick) {
      let need = true
      try {
        const p3 = fm.joinPath(DIR, "plan3.json")
        if (fm.fileExists(p3)) {
          const o = JSON.parse(fm.readString(p3))
          need = !(o && (o.days || []).some(d => d.date === todayISO()))
        }
      } catch (e) { need = true }
      if (need) {
        for (const f of ["plan3.json", "plan-en.json", "plan-pol.json"]) {
          jobs.push((async () => {
            try {
              const r = new Request(LAN + "/" + f)
              r.timeoutInterval = 10
              const t = await r.loadString()
              if (t && t.length > 200) fm.writeString(fm.joinPath(DIR, f), t)
            } catch (e) {}
          })())
        }
      }
    }
    /* 进度：以 Mac 为准（含全部历史） */
    jobs.push((async () => {
      try {
        const r = new Request(LAN + "/api/done")
        r.timeoutInterval = 6
        const d = await r.loadJSON()
        if (d && d.done) fm.writeString(F_PROG, JSON.stringify({ done: d.done, dels: d.dels || {} }))
      } catch (e) {}
    })())
    /* 立绘：本机没有时拉一次 */
    if (!quick) {
      jobs.push((async () => {
        try {
          const pp = fm.joinPath(DIR, "pet.png")
          if (fm.fileExists(pp)) return
          const r = new Request(LAN + "/pet.png")
          r.timeoutInterval = 15
          const img = await r.loadImage()
          if (img) { try { fm.writeImage(pp, img) } catch (e) {} }
        } catch (e) {}
      })())
    }
    /* 总超时：组件 6s / App 12s，超时就先用本机缓存，绝不无限等 */
    await Promise.race([Promise.all(jobs), lanDelay(quick ? 6 : 12)])
  }

  function macEndpoints() {
    return [LAN]
  }
  /* —— GitHub Gist 中转（跨网络）：手机勾 → 私有 Gist → Mac 每 6s 拉取合并。
     免费方案，token 用 Mac 上已登录的 gh 账号生成，存你自己 iCloud 的 gist-conf.json —— */
  /* Gist 凭据来源（按顺序）：iCloud 上的 gist-conf.json → 本机保险箱 → 缺失时弹一次输入框。
     注意：token 绝不写进脚本（GitHub 会拒绝含密钥的提交），只存在这台设备本地。 */
  const GIST_ID = "f938a331f36d51aef967acfaa73f5716"
  const GIST_FILE = "xiaoman-progress.json"
  function gistConf() {
    try {
      const f = fm.joinPath(DIR, "gist-conf.json")
      if (fm.fileExists(f)) {
        const o = JSON.parse(fm.readString(f))
        if (o && o.id && o.token) return o
      }
    } catch (e) {}
    try {
      const lf = FileManager.local()
      const p = lf.joinPath(lf.documentsDirectory(), "xiaoman-gist.json")
      if (lf.fileExists(p)) {
        const o = JSON.parse(lf.readString(p))
        if (o && o.token) return { id: o.id || GIST_ID, token: o.token, file: GIST_FILE }
      }
    } catch (e) {}
    return null
  }
  async function ensureGistConf() {
    if (gistConf()) return true
    if (config.runsInWidget) return false
    try {
      const a = new Alert()
      a.title = "同步配置（只需一次）"
      a.message = "把 GitHub token 粘进来（只存这台手机，不会上传、不会进脚本）"
      a.addTextField("token", "")
      a.addAction("保存")
      a.addCancelAction("以后再说")
      if (await a.presentAlert() === -1) return false
      const tk = String(a.textFieldValue(0) || "").trim()
      if (!tk) return false
      const lf = FileManager.local()
      lf.writeString(lf.joinPath(lf.documentsDirectory(), "xiaoman-gist.json"),
        JSON.stringify({ id: GIST_ID, token: tk }))
      return true
    } catch (e) { return false }
  }
  /* v60：本机可靠存储（FileManager.local，完全不经过 iCloud 容器）——
     iCloud 抽风时：进度从这读、往这写；排期/英语/政治也都留一份本机缓存 */
  const progLocalPath = () => fml.joinPath(fml.documentsDirectory(), "xm-progress.json")
  const enLocalPath = () => fml.joinPath(fml.documentsDirectory(), "xm-plan-en.json")
  const polLocalPath = () => fml.joinPath(fml.documentsDirectory(), "xm-plan-pol.json")

  /* 从私有 Gist 取任一附属文件（plan-en/plan-pol 是私人资料，只进私有 Gist，不走公开渠道） */
  async function gistCloudFile(fname) {
    const c = gistConf(); if (!c) return null
    try {
      const g = new Request("https://api.github.com/gists/" + c.id)
      g.headers = { "Authorization": "token " + c.token, "User-Agent": "xiaoman-scriptable" }
      g.timeoutInterval = 8
      const t = await g.loadString()
      if (!t) return null
      const o = JSON.parse(t)
      const raw = ((o.files || {})[fname] || {}).content
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) { return null }
  }

  /* 只拉云端态（不回写）：iCloud 读挂时用它兜底恢复进度 */
  async function gistCloud() {
    const c = gistConf(); if (!c) return null
    const gf = c.file || "xiaoman-progress.json"
    try {
      const g = new Request("https://api.github.com/gists/" + c.id)
      g.headers = { "Authorization": "token " + c.token, "User-Agent": "xiaoman-scriptable" }
      g.timeoutInterval = 8
      const t = await g.loadString()
      if (!t) return {}
      const o = JSON.parse(t)
      const raw = ((o.files || {})[gf] || {}).content || "{}"
      try { return JSON.parse(raw) || {} } catch (e) { return {} }
    } catch (e) { return null }
  }

  async function pushGist(S, heartbeat) {
    const c = gistConf(); if (!c) return false
    try {
      const gf = c.file || "xiaoman-progress.json"
      // 先拉云端，把别人（Mac）新勾的并进来再回写，避免覆盖
      const cf = (await gistCloud()) || {}
      const nd = Object.assign({}, cf.done || {}), nl = Object.assign({}, cf.dels || {})
      const sd = S.done || {}
      for (const k in sd) {
        const v = sd[k] || 0
        if ((nl[k] || 0) >= v) continue
        if (!nd[k] || v > nd[k]) nd[k] = v
      }
      for (const k in RECENT_DEL) {
        const ts = RECENT_DEL[k]
        if ((nl[k] || 0) < ts) nl[k] = ts
        if (nd[k] !== undefined && (nd[k] || 0) < ts) delete nd[k]
      }
      // 保留云端未知字段（Mac 的心跳等），并写自己的心跳，方便电脑端确认手机推成功
      const out = Object.assign({}, cf, { done: nd, dels: nl,
        _seen: Date.now(), _ver: "gist2", _host: "iphone", _beat: heartbeat ? 1 : 0 })
      const req = new Request("https://api.github.com/gists/" + c.id)
      req.method = "PATCH"
      req.headers = { "Authorization": "token " + c.token, "Content-Type": "application/json", "User-Agent": "xiaoman-scriptable" }
      req.body = JSON.stringify({ files: { [gf]: { content: JSON.stringify(out) } } })
      req.timeoutInterval = 8
      await req.loadString()
      return true
    } catch (e) { return false }
  }
  async function pushToMac(S) {
    const urls = macEndpoints(); if (!urls.length) return
    const body = JSON.stringify({ token: MAC_TOKEN, done: S.done || {}, del: RECENT_DEL })
    for (const u of urls) {
      try {
        const req = new Request(u + "/api/sync")
        req.method = "POST"
        req.headers = { "Content-Type": "application/json" }
        req.body = body
        req.timeoutInterval = 4
        const r = await req.loadString()
        if (r && r.indexOf('"ok":true') >= 0) return
      } catch (e) {}
    }
  }

  async function loadProg() {
    let done = null
    try {
      if (fm.fileExists(F_PROG)) {
        await ready(F_PROG)          // iCloud 占位文件必须先下载，否则读不到
        const o = JSON.parse(fm.readString(F_PROG))
        done = (o && o.done) || {}
        PROG_OK = true
        try { fml.writeString(progLocalPath(), JSON.stringify({ done: done })) } catch (e9) {}
      } else {
        done = {}
        PROG_OK = true               // 文件不存在 = 全新开始，允许写入
        /* v62：本机首次运行（iCloud 版文件拿不到）→ 本机缓存 → Gist 云端，把已有进度接回来 */
        try {
          const lp = progLocalPath()
          if (fml.fileExists(lp)) done = (JSON.parse(fml.readString(lp)) || {}).done || {}
        } catch (e20) {}
        if (!done || !Object.keys(done).length) {
          try { const cd = await gistCloud(); if (cd && cd.done) done = cd.done } catch (e21) {}
        }
      }
    } catch (e) {
      /* v60：iCloud 容器抽风（原生层读写都可能炸）→ 本机缓存 → Gist 云端，进度绝不归零 */
      PROG_OK = false
      try {
        const lp = progLocalPath()
        if (fml.fileExists(lp)) done = (JSON.parse(fml.readString(lp)) || {}).done || {}
      } catch (e2) {}
      if (!done || !Object.keys(done).length) {
        try { const cd = await gistCloud(); if (cd && cd.done) done = cd.done } catch (e3) {}
      }
    }
    // 把上次没写进去的本地兜底并回来
    const pend = (pendRead().done) || {}
    if (Object.keys(pend).length) {
      mergeInto(done, pend)
      if (PROG_OK) {
        try { ensureDir(); fm.writeString(F_PROG, JSON.stringify({ done: done })); pendClear() } catch (e) {}
      }
    }
    PROG_BASE = Object.assign({}, done)
    return { done: done }
  }

  function saveProg(p) {
    if (PROG_OK) {
      try {
        ensureDir()
        // 写前重读云端：把其它设备（Mac）这段时间新增的勾并进来，不整份覆盖
        let theirs = null
        try {
          if (fm.fileExists(F_PROG)) {
            const o = JSON.parse(fm.readString(F_PROG))
            theirs = (o && o.done) || null
          }
        } catch (e) { theirs = null }
        const out = Object.assign({}, p)
        if (theirs && PROG_BASE) out.done = merge3(PROG_BASE, p.done || {}, theirs)
        fm.writeString(F_PROG, JSON.stringify(out))
        try { fml.writeString(progLocalPath(), JSON.stringify(out)) } catch (e9) {}
        PROG_BASE = Object.assign({}, out.done || {})
        return true
      } catch (e) {}
    }
    // 写不进 iCloud：本机可靠落盘（下次启动降级读它）+ pend 队列，勾绝不丢
    try { fml.writeString(progLocalPath(), JSON.stringify({ done: p.done || {} })) } catch (e9) {}
    pendWrite(p.done || {})
    return false
  }
  /* 勾完立刻让桌面小组件重算 —— 否则 iOS 按自己的节奏刷新，
     表现就是「出来一看还是旧进度，再进一次退出来才对」（2026-10-25 用户反馈）。
     Widget.reloadAll() 是 Scriptable 官方接口，会请求系统尽快重跑组件脚本；
     连续点几下时做 1.5 秒去抖，避免被系统判定为滥用而丢弃请求。 */
  let _kickAt = 0
  function kick(reason, force) {
    const now = Date.now()
    if (!force && now - _kickAt < 1500) return
    _kickAt = now
    try { Widget.reloadAll() } catch (e) {}
  }
  /* 勾选 → 二轮复习 App 直连同步（2026-10-27）：
     把全部勾选打包进 erround://scsync?d=… 唤起 App，App 端合并进完成记录，
     不再依赖与 Mac 同一 Wi-Fi 的中枢同步。连续打勾时只在停手 2.5s 后
     弹一次 —— 否则每勾一条就被切走一次，根本没法连着勾。 */
  let _syncTapAt = 0
  function scheduleAppSync(S) {
    if (syncMode() === "off") return
    markPend()                      /* 先记一笔：任何模式下都不丢，只是送得早或晚 */
    /* 2026-11-05 用户拍板「勾完停手即推」：iCloud 手机→Mac 通道整天卡死过
       （progress.json 停在昨天 14:53），勾选只有 erround:// 直推才可靠。
       夜间批量取消按次拦截：每次勾选停手 2.5 秒推一次，连续勾不打扰；
       22:00 那轮 needPushNow 兜底保留（已推过的 pendAt=0，不会重复唤起）。 */
    const mine = Date.now()
    _syncTapAt = mine
    try {
      Timer.schedule(2.5, () => { if (_syncTapAt === mine) { syncToApp(S); pushToMac(S); pushGist(S) } })
    } catch (e) {}
  }
  function syncToApp(S, force) {
    if (syncMode() === "off" && !force) return false
    try {
      const done = S.done || {}
      const all = Object.keys(done).sort((a, b) => done[b] - done[a])
      const items = all.slice(0, 300).map(k => k + "=" + done[k])
      if (!items.length) { saveSyncSt({ pendAt: 0 }); return false }
      /* f=1：告诉 App「这是全量快照」，没列出来的就是已取消 ——
         App 端据此撤掉对应完成标记（2026-10-28，之前只能加不能撤）。
         ⚠ 只有**真的全量**才能带 f=1：勾选总数超过 300 条时这里会截断，
         若还带 f=1，被截掉的老勾会被 App 当成「取消」—— 一年后必然踩到。
         所以截断时降级成 f=0（只加不撤），宁可少撤也不能误删。 */
      const full = all.length <= 300
      const url = "erround://scsync?n=" + items.length + (full ? "&f=1" : "&f=0")
        + "&d=" + encodeURIComponent(items.join("\n"))
      Safari.open(url)
      saveSyncSt({ pendAt: 0, lastPush: dayStr() })   /* 推过了：当晚不再重复唤起 */
      return true
    } catch (e) { return false }
  }
  /* patch-robust-20261031 排期加载加固 ----
     iCloud 同步中 / 断网 / Pages 慢，三种情况以前都会让 loadPlan 返回 null → 白屏。
     现在：iCloud → 手机本地兜底 → Pages + jsDelivr 双源，任一命中即可显示。 */
  function planOk(o) { return !!(o && o.days && o.days.length) }
  function planLocalPath() { return fml.joinPath(DIR_L, "plan3.json") }
  function savePlanLocal(o) {
    try {
      if (!fml.fileExists(DIR_L)) fml.createDirectory(DIR_L, true)
      fml.writeString(planLocalPath(), JSON.stringify(o))
    } catch (e) {}
  }
  function loadCoach(iso) {
    try {
      if (!fm.fileExists(F_AI)) return null
      const o = JSON.parse(fm.readString(F_AI))
      const q = o && o.quotes ? o.quotes[iso] : null
      if (!q || q.src !== "coach" || !q.detail) return null
      return q
    } catch (e) { return null }
  }
  /* 昨天复盘：tools/coach.py 每天早晨按昨日真实作答复盘，
     比 21:00 那句固定寄语贴身得多 —— 聊完"你昨天错在哪"，下面才是今天的课 */
  const MARK = ["①", "②", "③", "④", "⑤"]
  function coachBlock(t, iso) {
    const c = loadCoach(iso)
    if (!c) return
    const st = c.stat || {}
    const tail = typeof st.y_acc === "number"
      ? " · 昨天 " + st.y_n + " 题 " + Math.round(st.y_acc * 100) + "%" : ""
    t.addRow(head("小满的复盘" + tail, (c.acts && c.acts.length) ? "今天 " + c.acts.length + " 件事" : ""))
    recBlock(t, iso)   /* 2026-11-01：补弱推荐接进主界面 —— 之前只躺在 rec.json 里，谁也看不到 */
    const r = new UITableRow()
    r.height = 96
    const tx = r.addText(c.detail)
    tx.titleFont = Font.systemFont(12.5)
    tx.titleColor = TC.txt
    try { tx.lineLimit = 4 } catch (e) {}
    r.dismissOnSelect = false
    t.addRow(r)
    ;(c.acts || []).forEach((x, i) => {
      const a = mrow((MARK[i] || (i + 1) + ".") + " " + x, "", TC.link, 38)
      a.dismissOnSelect = false
      t.addRow(a)
    })
  }
  /* 电脑不开机也能有推荐：GitHub Actions 每天 21:30 用云端作答算好 rec.json
     发到 Pages，这里拉一次写进 iCloud 当缓存（拉不到就沿用上一份，不影响别的块）*/
  /* 一天最多拉一次（按 iCloud 上文件的修改时间算）：GitHub Pages 在国内冷启动常常 3–8 秒，
     之前每次开小满都要排三个网络请求，这就是「越用越慢」的主因。 */
  /* ===== 跨端同步节律（2026-11-01 v44）=====
     以前：勾一条 → 2.5 秒后 Safari.open("erround://…")，iOS 每次都弹
     「在小满中打开二轮复习？」，关清单时还要补推一次；开小满又并行排
     三个 GitHub Pages 请求（rec/tomorrow/kb）。一天下来手机被唤醒很多次。
     现在对齐 GitHub Actions 那条 21:30 的夜间批处理，改成「夜里集中」：
       · 拉数据：只在 22:00–24:00 窗口内拉（当晚一轮，23:10 后再补一轮）；
         其余时刻零出网，直接用 iCloud 上的缓存（昨晚算好的就是明天的安排）
       · 推勾选：白天只记一笔「待同步」，不唤起 App；夜里第一次推一次全量
       · 想立刻同步/立刻拉：主界面那行「待同步 N 条」或 ⚙ 设置里手动点
     代价是白天勾的东西当晚才进 App —— 二轮复习的题单本来就是按天算的，够用。*/
  const F_SYNCST = fm.joinPath(DIR, "sync-state.json")
  const NIGHT_START = 22   /* 「夜里」从 22:00 起：Actions 21:30 算完，22 点拉正好拿到新的 */
  const NIGHT_END = 24
  let SYNC_ST = { mode: "night", lastPull: "", lastPullAt: 0, lastPush: "", pendAt: 0 }
  function loadSyncSt() {
    try {
      if (fm.fileExists(F_SYNCST)) {
        const o = JSON.parse(fm.readString(F_SYNCST))
        if (o && typeof o === "object") SYNC_ST = Object.assign(SYNC_ST, o)
      }
    } catch (e) {}
    if (["night", "instant", "off"].indexOf(SYNC_ST.mode) < 0) SYNC_ST.mode = "night"
    return SYNC_ST
  }
  function saveSyncSt(patch) {
    try {
      if (patch) SYNC_ST = Object.assign(SYNC_ST, patch)
      if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true)
      fm.writeString(F_SYNCST, JSON.stringify(SYNC_ST))
    } catch (e) {}
    return SYNC_ST
  }
  function syncMode() { return SYNC_ST.mode || "night" }
  function syncLabel() {
    const m = syncMode()
    return m === "instant" ? "勾完即时" : m === "off" ? "已关闭" : "夜间批量"
  }
  function dayStr(d) {
    const x = d || new Date()
    return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2)
  }
  /* 「夜里」= 22:00–24:00。不跨零点：凌晨那次既不用重拉（数据已经够新），
     也不会突然弹「打开二轮复习」。 */
  function inNight() {
    const h = new Date().getHours()
    return h >= NIGHT_START && h < NIGHT_END
  }
  /* 23:10 这个锚点：21:30 那次 Actions 万一失败，23:00 还有一次兜底，
     所以在 23:10 之前拉过的那一轮不算「今晚最后一版」，过了 23:10 允许补拉一次。*/
  function tonightAnchor() {
    const d = new Date()
    d.setHours(23, 10, 0, 0)
    return d.getTime()
  }
  function markPend() { saveSyncSt({ pendAt: Date.now() }) }
  /* 该不该出网拉数据：没缓存必拉；有缓存则只在夜里拉 —— 今晚一轮，23:10 后补一轮。
     v46 补丁：夜里那轮没拉成（比如 22–24 点没开过 App），白天开时数据已过期
     （tomorrow 那份不是今天/明天的），允许当天第一个开 App 的时刻补拉一次；
     用 lastPull 记账，一天最多补一次，不会每次打开都出网空转。 */
  /* 安排（plan3）云端刷新（2026-11-05）：iCloud 手机→Mac 会整天卡住
     （progress.json 停在前一天，349打卡/ 零同步），plan3 同一条通道 ——
     新排期到不了手机。夜间批量 / 手动拉取时顺带从 Pages 拿一份：
     meta.plan_ver 比手上新才覆盖，拿不到就用旧数据（绝不白屏）。 */
  async function pullPlanCloud(force) {
    if (!force && Date.now() - (SYNC_ST.planAt || 0) < 6 * 3600e3) return false
    let old = ''
    try {
      if (fm.fileExists(F_PLAN)) {
        const o = JSON.parse(fm.readString(F_PLAN))
        old = String((o && o.meta && o.meta.plan_ver) || '')
      }
    } catch (e) {}
    const SRC = [BASE + "plan3.json",
                 "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/plan3.json"]
    for (const u of SRC) {
      try {
        const r = new Request(u)
        r.timeoutInterval = 15
        const fresh = await r.loadJSON()
        if (!planOk(fresh)) continue
        const nv = String((fresh.meta && fresh.meta.plan_ver) || '')
        if (old && nv && nv <= old) { saveSyncSt({ planAt: Date.now() }); return false }
        savePlanLocal(fresh)
        try { if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true); fm.writeString(F_PLAN, JSON.stringify(fresh)) } catch (e) {}
        saveSyncSt({ planAt: Date.now() })
        return true
      } catch (e) {}
    }
    return false
  }

  /* 政治日程云端刷新（2026-11-05）：plan-pol.json 原先只读 iCloud，
     iCloud 卡住时「日内章节顺序」这类修正到不了手机。meta.pol_ver 门控。 */
  async function pullPolCloud(force) {
    if (!force && Date.now() - (SYNC_ST.polAt || 0) < 6 * 3600e3) return false
    let old = ''
    try {
      if (fm.fileExists(F_POL)) {
        const o = JSON.parse(fm.readString(F_POL))
        old = String((o && o.meta && o.meta.pol_ver) || '')
      }
    } catch (e) {}
    const SRC = [BASE + "plan-pol.json",
                 "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/plan-pol.json"]
    for (const u of SRC) {
      try {
        const r = new Request(u)
        r.timeoutInterval = 15
        const fresh = await r.loadJSON()
        if (!fresh || !fresh.days || !fresh.days.length) continue
        const nv = String((fresh.meta && fresh.meta.pol_ver) || '')
        if (old && nv && nv <= old) { saveSyncSt({ polAt: Date.now() }); return false }
        try { if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true); fm.writeString(F_POL, JSON.stringify(fresh)) } catch (e) {}
        POL = fresh
        saveSyncSt({ polAt: Date.now() })
        return true
      } catch (e) {}
    }
    return false
  }

  function needPullNow() {
    if (!fm.fileExists(F_REC) || !fm.fileExists(F_TMR) || !fm.fileExists(F_KB)) return true
    if (!inNight()) {
      if (SYNC_ST.lastPull === dayStr()) return false
      const t = loadTmr()
      return !t || !t.for_date || String(t.for_date) < dayStr()
    }
    if (SYNC_ST.lastPull !== dayStr()) return true
    return (SYNC_ST.lastPullAt || 0) < tonightAnchor()
  }
  /* 该不该把勾选推给二轮复习 App */
  function needPushNow() {
    if (syncMode() === "off") return false
    if (!SYNC_ST.pendAt) return false
    if (syncMode() === "instant") return true
    return inNight() && SYNC_ST.lastPush !== dayStr()
  }
  function freshEnough(path, ms) {
    try {
      if (!fm.fileExists(path)) return false
      return (Date.now() - fm.fileModificationDate(path).getTime()) < ms
    } catch (e) { return false }
  }
  async function pullRecCloud(force) {
    try {
      if (!force && freshEnough(F_REC, 6 * 3600 * 1000)) return
      const r = new Request(BASE + "rec.json?t=" + Date.now())
      r.timeoutInterval = 8
      const d = await r.loadJSON()
      if (!d || !d.items || !d.items.length) return
      const old = loadRec()
      if (old && old.built === d.built) return
      fm.writeString(F_REC, JSON.stringify(d))
    } catch (e) {}
  }

  function loadTmr() {
    try {
      if (!fm.fileExists(F_TMR)) return null
      return JSON.parse(fm.readString(F_TMR)) || null
    } catch (e) { return null }
  }

  /* 明天的安排由云端算好（GitHub Actions），这里只负责拉下来写进 iCloud。
     拉不到就沿用上一份 —— 家里的电脑开不开机都不影响。*/
  async function pullTomorrowCloud(force) {
    try {
      if (!force && freshEnough(F_TMR, 6 * 3600 * 1000)) return
      const r = new Request(BASE + "tomorrow.json?t=" + Date.now())
      r.timeoutInterval = 8
      const d = await r.loadJSON()
      if (!d || !d.for_date) return
      const old = loadTmr()
      if (old && old.built === d.built) return
      fm.writeString(F_TMR, JSON.stringify(d))
    } catch (e) {}
  }

  /* ===== 药学助教知识库 =====
     内容是从 ai-tutor 的考点串讲里抽出来的（考点要点 + 问答卡），
     整份只有 320KB，一次性下到手机上，之后离线查，不依赖 Mac 也不依赖云端在线。 */
  function loadKB() {
    try {
      if (!fm.fileExists(F_KB)) return null
      return JSON.parse(fm.readString(F_KB)) || null
    } catch (e) { return null }
  }

  async function pullKbCloud(force) {
    const old = loadKB()
    try {
      /* 一天最多下一次（320KB），免得每次开都吃流量 */
      if (!force && old && (Date.now() - fm.fileModificationDate(F_KB).getTime()) < 86400000) return
    } catch (e) {}
    try {
      const r = new Request(BASE + "kb.json?t=" + Date.now())
      r.timeoutInterval = 20
      const d = await r.loadJSON()
      if (!d || !d.points) return
      if (old && old.built && old.built === d.built) return   // 云端没更新就不重写
      fm.writeString(F_KB, JSON.stringify(d))
    } catch (e) {}
  }

  /* 中文没有空格，按二字切分做粗匹配就够用了 */
  function kbGrams(str) {
    const t = String(str || "").replace(/[\s·（）()、，,。；;：:【】\[\]"'？?！!]/g, "")
    const out = []
    for (let i = 0; i < t.length - 1; i++) out.push(t.substr(i, 2))
    return out
  }

  /* 「离子」这种到处都有的词权重必须压低，否则查「碳负离子」会把质谱法翻出来。
     做法是文档频率：一个二字词在越少的地方出现，它越有指向性。 */
  let _kbIdx = null

  function kbIndex(kb) {
    const n = (kb.points || []).length + (kb.cards || []).length
    if (_kbIdx && _kbIdx.n === n) return _kbIdx
    const df = {}
    const docs = []
    ;(kb.points || []).forEach(p => docs.push((p.name || "") + " " + (p.tips || []).join(" ")))
    ;(kb.cards || []).forEach(c => docs.push((c.q || "") + " " + (c.a || "")))
    docs.forEach(d => {
      const seen = {}
      kbGrams(d).forEach(x => { if (!seen[x]) { seen[x] = 1; df[x] = (df[x] || 0) + 1 } })
    })
    _kbIdx = { n: n, df: df }
    return _kbIdx
  }

  function kbSearch(kb, q, n) {
    const qa = kbGrams(q)
    if (!qa.length) return []
    const idx = kbIndex(kb)
    const qset = {}
    let total = 0
    qa.forEach(x => {
      if (qset[x] != null) return
      const w = Math.log((idx.n + 1) / ((idx.df[x] || 0) + 1)) + 1
      qset[x] = w
      total += w
    })
    const res = []
    ;(kb.points || []).forEach(p => {
      let sc = 0
      const seen = {}
      kbGrams((p.name || "") + " " + (p.tips || []).join(" ")).forEach(x => {
        if (qset[x] != null && !seen[x]) { seen[x] = 1; sc += qset[x] }
      })
      sc = sc / total
      if (sc >= 0.3) res.push({ t: "考点 · " + p.name, body: (p.tips || []).join("\n\n"), sc: sc + 0.12 })
    })
    ;(kb.cards || []).forEach(c => {
      let sc = 0
      const seen = {}
      kbGrams((c.q || "") + " " + (c.a || "")).forEach(x => {
        if (qset[x] != null && !seen[x]) { seen[x] = 1; sc += qset[x] }
      })
      sc = sc / total
      if (sc >= 0.34) res.push({ t: String(c.q || "").replace(/是什么[？?]要点是什么[？?]$/, ""), body: c.a || "", sc: sc })
    })
    res.sort((x, y) => (y.sc - x.sc) || (String(x.t).length - String(y.t).length))
    return res.slice(0, n)
  }

  async function kbAsk() {
    const kb = loadKB()
    const a = new Alert()
    a.title = "查知识"
    a.message = kb
      ? ("本地存着 " + ((kb.points || []).length) + " 个考点 / " + ((kb.cards || []).length) + " 张卡　离线可查")
      : "还没缓存，联网打开一次小满就会自动下载"
    a.addTextField("如：比尔定律 / 青霉素 / 缩合", "")
    a.addAction("查")
    a.addCancelAction("关闭")
    const i = await a.presentAlert()
    if (i !== 0) return
    const q = String(a.textFieldValue(0) || "").trim()
    if (!q) return
    if (!kb) {
      const e = new Alert()
      e.title = "还没有知识库"
      e.message = "联网打开一次小满，会自动把 320KB 知识库下到手机。"
      e.addAction("好")
      await e.presentAlert()
      return
    }
    const hits = kbSearch(kb, q, 4)
    if (!hits.length) {
      const e = new Alert()
      e.title = "没找到「" + q + "」"
      e.message = "换个课本上的说法试试，比如把\"紫外\"换成\"吸收光谱\"。"
      e.addAction("好")
      await e.presentAlert()
      return
    }
    const b = new Alert()
    b.title = "「" + q + "」"
    b.message = "找到 " + hits.length + " 条，点开看："
    hits.forEach(h => b.addAction(String(h.t).slice(0, 36)))
    b.addCancelAction("取消")
    const j = await b.presentAlert()
    if (j < 0) return
    const d = new Alert()
    d.title = String(hits[j].t).slice(0, 48)
    d.message = String(hits[j].body || "").slice(0, 1800)
    d.addAction("知道了")
    await d.presentAlert()
  }

  /* 明天该干什么：主线照大纲走，重点是昨天做砸的那块 */
  function tomorrowBlock(t, iso) {
    const R = loadTmr()
    if (!R || !R.for_date) return
    const fd = String(R.for_date)
    const today = new Date()
    const t0 = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0")
      + "-" + String(today.getDate()).padStart(2, "0")
    const isToday = fd === t0
    /* 只认「今天或明天」那份；更旧的说明云端好几天没更新，宁可不说 */
    const d0 = new Date(fd.replace(/-/g, "/")).getTime()
    const dd = Math.round((d0 - new Date(t0.replace(/-/g, "/")).getTime()) / 86400000)
    /* 云端上次生成的时间，让人一眼看出数据新不新 */
    const bt = R.built ? String(R.built).slice(5, 16).replace("-", "/") : ""
    if (dd < 0 || dd > 1) {
      /* 不拿过期任务糊弄，但要说一句：这块空着是云端没更新上 */
      if (dd < 0) {
        t.addRow(head("明天的安排",
          "云端这几天没更新上" + (bt ? "　最后成功 " + bt : "") + "　先按昨天的走"))
      }
      return
    }

    const main = R.main || [], focus = R.focus || [], rec = R.rec || []
    const tot = focus.reduce((a, x) => a + (x.quota || 0), 0)
    const head0 = (isToday ? "今天的安排 · " : "明天的安排 · ") + fd.slice(5).replace("-", "/")
      + "　主线 " + main.length + " 条 · 重点 " + tot + " 题"
    t.addRow(head(head0, (R.coach && R.coach.detail) ? R.coach.detail : "主线不动，只调重点"))
    /* 时间单独一行：副标题装不下「复盘 + 云端时间」，挤在一起会互相截断 */
    if (bt) t.addRow(mrow("云端 " + bt + " 生成", "", TC.dim, 32))

    if (main.length) {
      const hr = mrow("主线（照大纲走）", main.length + " 条", TC.txt, 38)
      t.addRow(hr)
      main.slice(0, 8).forEach(m => {
        t.addRow(mrow("　" + (m.sub_cn || m.sub) + "　" + String(m.title || "").slice(0, 26),
          "复习计划原文", TC.txt, 40))
      })
    }
    if (focus.length) {
      t.addRow(mrow("重点（按昨天的数据调）", "先补最弱的", TC.txt, 38))
      focus.forEach(f => {
        const r = mrow("　" + (f.sub_cn || f.sub) + "　" + (f.sys || "") + "　" + (f.quota || 0) + " 题",
          f.why || "", TC[f.sub] || TC.txt, 42)
        t.addRow(r)
        /* 知识点来自 ai-tutor 药学助教的考点串讲（云端 kb.json） */
        const ts = (f.tips || []).slice(0, 1)
        ts.forEach(x => t.addRow(mrow("　　· " + String(x).slice(0, 30), String(x).slice(30, 90), TC.txt, 44)))
        const c = f.card
        if (c && c.a) {
          const cr = mrow("　　▤ " + String(c.q || "").slice(0, 18), String(c.a).slice(0, 56), TC.txt, 46)
          cr.onSelect = () => {
            const al = new Alert()
            al.title = String(c.q || "知识卡").slice(0, 40)
            al.message = String(c.a || "")
            al.addAction("知道了")
            al.presentAlert().catch(() => {})
          }
          t.addRow(cr)
        }
      })
      /* 整份知识库在手机上，随时能查 */
      const kbRow = mrow("查知识　考点 + 知识卡", "本地缓存 · 不用连电脑", TC.link, 44)
      kbRow.onSelect = () => { kbAsk() }
      t.addRow(kbRow)
    }
    if (rec.length) {
      t.addRow(mrow("看什么", rec.length + " 节 · " + rec.reduce((a, x) => a + (x.min || 0), 0) + " 分钟", TC.txt, 38))
      rec.forEach(v => {
        const r = mrow("▶ " + String(v.title || "").slice(0, 24),
          (v.sub_cn || "") + " · " + (v.min || 0) + " 分钟", TC.link, 46)
        r.onSelect = () => { try { openPlay(v.url, v.title) } catch (e) {} }
        t.addRow(r)
      })
    }
    if (R.coach && (R.coach.acts || []).length) {
      const mk = ["①", "②", "③", "④", "⑤"]
      t.addRow(mrow("小满的动作", R.coach.acts.map((x, i) => (mk[i] || (i + 1)) + " " + x).join("　"), TC.txt, 54))
    }
  }

  function loadRec() {
    try {
      if (!fm.fileExists(F_REC)) return null
      return JSON.parse(fm.readString(F_REC)) || null
    } catch (e) { return null }
  }
  /* 今日推荐：tools/recommend.py 每次抓到新作答就重算一遍
     （Elo 能力估计 + FSRS 遗忘曲线 → 缺口最大的系统 → 单位时间收益最高的那节课） */
  function recBlock(t, iso) {
    const R = loadRec()
    if (!R || !R.items || !R.items.length) return
    /* 只看新鲜度：20 小时内算的才显示（一天重算 5 次，隔夜旧数据不冒充今天）*/
    const bt = new Date(String(R.built || "").replace(/-/g, "/")).getTime()
    const ageH = (Date.now() - bt) / 3600000
    if (!isFinite(ageH) || ageH > 20 || ageH < -1) return
    const tot = R.items.reduce((a, x) => a + (x.min || 0), 0)
    t.addRow(head("今日推荐 · " + R.items.length + " 节 · " + tot + " 分钟", "按掌握度挑的 · 点开直接看"))
    R.items.forEach(v => {
      const r = mrow("▶ " + cut(v.title || (v.sub_cn + " 补弱"), 30),
        cut(v.sub_cn + " · " + (v.min || "?") + " 分钟 · " + (v.level || "") + " · " + (v.why || ""), 34),
        TC.link, 46)
      r.dismissOnSelect = false
      r.onSelect = () => { try { openPlay(v.url, v.title) } catch (e) {} }
      const b = r.addButton("▶")
      b.titleColor = TC.link
      b.onTap = r.onSelect
      t.addRow(r)
    })
  }
  async function loadPlan() {
    /* ⓪ 启动提速（2026-11-01）：iCloud 那份还没下载完时不再干等。
       先用手机本地那份（上次成功读过的排期）把界面顶起来，下载扔后台，
       下次进来/组件下一次刷新就是新的。以前这里会卡在 downloadFileFromiCloud 上几秒。 */
    const needDl = false
    if (needDl) {
      try { fm.downloadFileFromiCloud(F_PLAN) } catch (e) {}
      try {
        const pl = planLocalPath()
        if (fml.fileExists(pl)) {
          const lo = JSON.parse(fml.readString(pl))
          if (planOk(lo)) return lo
        }
      } catch (e) {}
    }
    /* ① iCloud 里的 plan3.json（手机端权威） */
    let cached = null
    try {
      if (fm.fileExists(F_PLAN)) {
        await ready(F_PLAN)
        const txt = fm.readString(F_PLAN)
        if (txt && txt.length > 200) cached = JSON.parse(txt)
      }
    } catch (e) {}
    if (planOk(cached)) { savePlanLocal(cached); return cached }

    /* ② 手机本地兜底：上次成功拿到的排期，断网也能看，不白屏 */
    try {
      const p = planLocalPath()
      if (fml.fileExists(p)) {
        const o = JSON.parse(fml.readString(p))
        if (planOk(o)) return o
      }
    } catch (e) {}

    /* ③ 远端双源：GitHub Pages → jsDelivr（国内 CDN，更抗 DNS 污染/限速） */
    const SRC = [BASE + "plan3.json", "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/plan3.json"]
    for (const u of SRC) {
      try {
        const r = new Request(u)
        r.timeoutInterval = 15
        const fresh = await r.loadJSON()
        if (planOk(fresh)) {
          savePlanLocal(fresh)
          try { ensureDir(); fm.writeString(F_PLAN, JSON.stringify(fresh)) } catch (e) {}
          return fresh
        }
      } catch (e) {}
    }

    /* ④ 全都拿不到：本地兜底里若有旧数据已经在 ② 返回过了，这里只剩真·首次安装 */
    return null
  }

  /* ---------- 政治日程（plan-pol.json，10/26–12/18 共 54 天） ----------
     排期依据：近五年 41 道错题画像 —— 时政记忆 32% + 概念术语 22% + 史纲定位 20% = 73%，
     选择题基线 39.2、总分预估 73；目标 68–72，每天 1.5 小时。
     视频走 B 站（能直接播），新东方冲刺/模考类只在 App 内看，点开会提示。 */
  let POL = null
  const polDayOf = iso => (POL ? (POL.days.find(d => d.date === iso) || null) : null)
  function polToday(iso) {
    if (!POL) return null
    return polDayOf(iso) || POL.days.find(d => d.date > iso) || POL.days[POL.days.length - 1]
  }
  async function loadPol() {
    try {
      if (!fm.fileExists(F_POL)) {
        /* v62：本机没有 → 本机缓存 → 私有 Gist（政治排期是私人资料，只走私有 Gist） */
        try {
          const p = polLocalPath()
          if (fml.fileExists(p)) { const j = JSON.parse(fml.readString(p)); if (j && j.days && j.days.length) return j }
        } catch (e22) {}
        try {
          const j = await gistCloudFile("plan-pol.json")
          if (j && j.days && j.days.length) { try { fml.writeString(polLocalPath(), JSON.stringify(j)) } catch (e23) {} return j }
        } catch (e24) {}
        return null
      }
      await ready(F_POL)
      const j = JSON.parse(fm.readString(F_POL))
      if (j && j.days && j.days.length) { try { fml.writeString(polLocalPath(), JSON.stringify(j)) } catch (e9) {} }
      return (j && j.days && j.days.length) ? j : null
    } catch (e) {
      try {
        const p = polLocalPath()
        if (fml.fileExists(p)) { const j = JSON.parse(fml.readString(p)); if (j && j.days && j.days.length) return j }
      } catch (e2) {}
      try {
        const j = await gistCloudFile("plan-pol.json")
        if (j && j.days && j.days.length) { try { fml.writeString(polLocalPath(), JSON.stringify(j)) } catch (e9) {} return j }
      } catch (e3) {}
      return null
    }
  }

  /* ---------- 英语日程（plan-en.json，与本组件中的药学并排） ---------- */
  let EN = null
  let RV = null      /* 昨日阅读复盘（en-review.json） */
  let CD = null      /* 今日完形三空（cloze-daily.json） */
  /* 英语任务的键带上日期：plan-en 的 key(W01/D01/…) 是按天递增的，加日期才彻底不撞 */
  const enTid = (date, t) => "en|" + date + "|" + t.key
  function enDay(iso) { return EN ? (EN.days.find(d => d.date === iso) || null) : null }
  /* 今天没有英语课（计划没开始 / 已结束）时，取最近的下一天顶上 */
  function enFallback(iso) { return EN ? (EN.days.find(d => d.date > iso) || null) : null }
  function enToday(iso) { return enDay(iso) || enFallback(iso) }
  /* ★ 版权口径（2026-10-25 起）：plan-en.json 里有新东方付费课程的课时名/讲师/内部 id，
     属于私人学习资料。只从 iCloud Drive（本人设备间同步）读取，绝不联网、绝不上传公开仓库。 */
  async function loadEn() {
    try {
      if (!fm.fileExists(F_EN)) {
        try {
          const p = enLocalPath()
          if (fml.fileExists(p)) { const j = JSON.parse(fml.readString(p)); if (j && j.days && j.days.length) return j }
        } catch (e25) {}
        try {
          const j = await gistCloudFile("plan-en.json")
          if (j && j.days && j.days.length) { try { fml.writeString(enLocalPath(), JSON.stringify(j)) } catch (e26) {} return j }
        } catch (e27) {}
        return null
      }
      await ready(F_EN)
      const j = JSON.parse(fm.readString(F_EN))
      if (j && j.days && j.days.length) { try { fml.writeString(enLocalPath(), JSON.stringify(j)) } catch (e9) {} }
      return (j && j.days && j.days.length) ? j : null
    } catch (e) {
      try {
        const p = enLocalPath()
        if (fml.fileExists(p)) { const j = JSON.parse(fml.readString(p)); if (j && j.days && j.days.length) return j }
      } catch (e2) {}
      try {
        const j = await gistCloudFile("plan-en.json")
        if (j && j.days && j.days.length) { try { fml.writeString(enLocalPath(), JSON.stringify(j)) } catch (e9) {} return j }
      } catch (e3) {}
      return null
    }
  }
  /* ---------- 英语阅读复盘（次日归类，2026-11-01） ----------
     方案：Day 1 做两篇 → Day 2 把前一天的错题按五类题型归类 → 推对应技巧视频。
     归类在 Mac 端算（tools/review_engine.py，口径与记录本网页完全一致），
     结果写到 iCloud「349打卡/en-review.json」，这里只负责显示 + 播视频。
     英语错题是私人资料，只走 iCloud，绝不联网拉取。 */
  async function loadRv() {
    try {
      if (!fm.fileExists(F_RV)) return null
      if (!(await ready(F_RV, true))) return null   /* 没下载完就后台下，本次不显示复盘块 */
      const j = JSON.parse(fm.readString(F_RV))
      return (j && j.date) ? j : null
    } catch (e) { return null }
  }
  async function loadCd() {
    try {
      if (!fm.fileExists(F_CD)) return null
      if (!(await ready(F_CD, true))) return null   /* 同上：完形块 */
      const j = JSON.parse(fm.readString(F_CD))
      return (j && j.date && j.items && j.items.length) ? j : null
    } catch (e) { return null }
  }
  function rvSeenGet() {
    try {
      if (!fm.fileExists(F_RVSEEN)) return ""
      return String(fm.readString(F_RVSEEN) || "").trim().slice(0, 32)
    } catch (e) { return "" }
  }
  function rvSeenSet(day) {
    try { ensureDir(); fm.writeString(F_RVSEEN, String(day)) } catch (e) {}
  }
  /* 复盘详情：题型分布 → 错题逐题 → 该补的技巧视频（点一行直接播） */
  function rvTable(r) {
    const t = new UITable()
    t.showSeparators = false
    const tt = r.totals || {}
    t.addRow(head("阅读复盘 · " + String(r.date || "").slice(5).replace("-", "/"),
      (tt.papers || 0) + " 篇 " + (tt.questions || 0) + " 题 · 错 " + (tt.wrong || 0) + " 题"
      + (tt.rate != null ? " · 正确率 " + Math.round(tt.rate * 100) + "%" : "")))

    const bys = (r.byType || []).slice().sort((a, b) => (b.wrong || 0) - (a.wrong || 0))
    if (bys.length) {
      t.addRow(head("题型分布", "错得最多的排最上面"))
      bys.forEach(v => {
        const bad = (v.wrong || 0) > 0
        const row = mrow(v.cn + " · " + (bad ? "错 " + v.wrong : "全对") + " / " + v.total + " 题",
          bad ? "重点补这一类" : "这一类稳住了", bad ? TC.pol : TC.ok, 42)
        row.dismissOnSelect = false
        t.addRow(row)
      })
    }

    if ((r.wrong || []).length) {
      t.addRow(head("错题逐题过", "越难的排越前，先重做上面这几道"))
      r.wrong.forEach(w => {
        const row = mrow(w.year + " " + w.label + " · 第 " + w.n + " 题 · " + w.cn,
          "我 " + w.mine + " → 答 " + w.answer + (w.causeCn ? " · " + w.causeCn : ""), TC.txt, 46)
        row.dismissOnSelect = false
        t.addRow(row)
      })
    }

    (r.push || []).forEach(p => {
      t.addRow(head(p.cn + " · 错 " + (p.wrong || 0) + "/" + (p.total || 0), cut(p.why, 58)))
      (p.videos || []).forEach(v => {
        const row = mrow("▶ P" + (v.p || 1) + " " + cut(v.title, 30),
          "阿超（陈志超）· 点一行直接播", TC.link, 48)
        row.dismissOnSelect = false
        const go = () => openPlay("https://www.bilibili.com/video/" + v.bv + "?p=" + (v.p || 1), v.title)
        row.onSelect = go
        const b = row.addButton("播放")
        b.titleColor = TC.link
        b.onTap = go
        t.addRow(row)
      })
    })

    /* 完形：阿超没有完形课，另聘宋逸轩。逻辑关系题占完形一半，他那六集正好逐一对应，
       所以这里不推「每日一句」，推「先把六种逻辑关系吃下来」。 */
    const cz = r.cloze
    if (cz && cz.logic && cz.logic.length) {
      t.addRow(head("完形 · 先补方法", cz.name + " · " + cz.logic.length + " 集 "
        + Math.round((cz.totalMin || 0) / 60) + " 小时 · 逻辑关系题占 "
        + Math.round((cz.logicRatio || 0) * 100) + "%"))
      cz.logic.forEach(v => {
        const row = mrow("▶ " + v.cn + " · " + (v.min || 0) + " 分", cut(v.title, 30), TC.link, 46)
        row.dismissOnSelect = false
        const go = () => openPlay("https://www.bilibili.com/video/" + v.bv + "?p=" + (v.p || 1), v.title)
        row.onSelect = go
        const b = row.addButton("播放")
        b.titleColor = TC.link
        b.onTap = go
        t.addRow(row)
      })
      if (cz.pack && cz.pack.bv) {
        const row = mrow("▶ 实战 · 2014 完形套题讲解", cut(cz.pack.title, 28), TC.dim, 46)
        row.dismissOnSelect = false
        const go = () => openPlay("https://www.bilibili.com/video/" + cz.pack.bv + "?p=1", cz.pack.title)
        row.onSelect = go
        const b = row.addButton("播放")
        b.titleColor = TC.dim
        b.onTap = go
        t.addRow(row)
      }
    }

    const back = mrow("看完了 · 回到清单", "带着方法把上面那几道错题重做一遍", TC.dim, 44)
    back.dismissOnSelect = true
    t.addRow(back)
    rvSeenSet(r.date)
    return t
  }

  /* 英语行的短标题：去掉末尾讲师名与「（限时 18 分钟）」这类时长括号。
     讲师名不写死（避免把他人姓名连同课程信息固化进源码），按「· + 2~4 个汉字」通用匹配。 */
  function enShort(s) {
    const x = String(s)
      .replace(/[·・]\s*[\u4e00-\u9fa5]{2,4}\s*$/, "")
      .replace(/（[^）]*分钟）/, "")
      .trim()
    return x.length > 22 ? x.slice(0, 22) + "…" : x
  }
  function enStatOf(iso, S) {
    const ed = enToday(iso)
    if (!ed) return null
    const done = ed.tasks.filter(t => S.done[enTid(ed.date, t)]).length
    return { ed, n: ed.tasks.length, done, today: ed.date === iso }
  }
  function enStats(S) {
    if (!EN) return null
    let n = 0, dn = 0
    EN.days.forEach(d => d.tasks.forEach(t => { n++; if (S.done[enTid(d.date, t)]) dn++ }))
    return { total: n, done: dn, pct: n ? Math.round(dn / n * 100) : 0 }
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
    dc.setStrokeColor(new Color("#A0A0F0", 0.22))
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
  /* 内置池按「日历天」轮换兜底：Mac 没生成、ai.json 是昨天的、断网，都不会连着两天同一句。 */
  const AI_FALLBACK = [
    "宝，先挑最短那节开头嘛，我陪你",
    "今天的坑我盯着呢，你先写单位哦",
    "困了呀，那就站起来晃两下，我等你",
    "昨天的错题还在等你，回去看一眼嘛",
    "坐下先做三道题再听课，好不好嘛",
    "记不住就编个自己的说法，我信你",
    "手机搁远一点点嘛，就一点点哦",
    "念一遍给我听，念顺了就算学会啦",
    "这章有点难，慢点也没关系呀",
    "看完这节我给你记一笔，记满一排",
    "你今天最想躲的那科，我先陪你开头",
    "写字慢就用符号，省下时间歇会儿嘛",
    "公式先写再代，别在脑子里算呀",
    "两个长得像的概念，先分清嘛，宝",
    "四十分钟一歇，我给你掐着表哦",
    "早上脑子最清，难的放这时候呀",
    "跳过拿不准的，回头我陪你再看",
    "合上书回想十秒，才算真看过哦",
    "心里没底很正常呀，我陪你接着做",
    "别为昨天补账，今天这点做完就算啦",
    "看不进去就抄一段，手会带脑子哦",
    "本子上那些疑问，今天挑两个问我嘛",
    "眼睛酸了就先眯一下，我数到十哦",
    "慢慢来嘛，我不催你，乖",
  ]
  /* 天数序号取模：相邻两天必然不同（池子长度 ≥ 2），所以「每天变化」是硬的 */
  /* 立绘柔光：淡紫圆斑，把「白紫宠物 + 暗紫背景」之间的落差垫平，
     不然立绘会像贴上去的贴纸。同心圆由外向内叠，alpha 平方递减，看着像灯罩。 */
  function halo(size, hex, peak) {
    const c = new DrawContext()
    c.size = new Size(size, size)
    c.opaque = false
    const n = 22
    for (let i = n; i >= 1; i--) {
      const r = size / 2 * i / n
      const a = peak * Math.pow(1 - i / n, 2.2)
      c.setFillColor(new Color(hex, a))
      const p = new Path()
      p.addEllipse(new Rect((size - 2 * r) / 2, (size - 2 * r) / 2, 2 * r, 2 * r))
      c.addPath(p)
      c.fillPath()
    }
    return c.getImage()
  }

  function fallbackAI() {
    const dayIdx = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)
    return AI_FALLBACK[dayIdx % AI_FALLBACK.length]
  }
  async function loadAI(d) {
    try {
      if (fm.fileExists(F_AI)) {
        /* 启动提速（2026-11-01）：寄语是 Mac 每晚 21:00 生成的，iCloud 那份没下载完时别干等 ——
           先用手机本地兜底的一句，组件 20 分钟刷一次，下一轮自然就是正主。 */
        if (!(await ready(F_AI, true))) return { text: fallbackAI(), src: "local" }
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
  /* 中号紧凑头部：第 N 天 + 日期 + 总进度环 */
  function miniHead(s, P, S, d) {
    const row = s.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    const iso = d ? d.date : todayISO()
    const es = enStatOf(iso, S)
    const dc = d ? d.tasks.filter(t => S.done[tid(t)]).length : 0
    const total = d ? d.tasks.length : 0
    const lf = row.addStack()
    lf.layoutVertically()
    const t1 = lf.addText(d ? "第 " + d.day + " 天" : (es ? "英语日程" : "已收口"))
    t1.font = Font.boldSystemFont(15)
    t1.textColor = TXT
    const t2 = lf.addText(d ? d.date.slice(5).replace("-", "/") + " " + d.wd + " · " + dc + "/" + d.tasks.length + " 条" +
      (es && !es.today ? " · 英 " + es.ed.date.slice(5).replace("-", "/") : "") + " · v" + UI_VER
      : (es ? es.ed.date.slice(5).replace("-", "/") + " " + es.ed.wd + " · " + es.done + "/" + es.n + " 条" : "阶段一结束"))
    t2.font = Font.mediumSystemFont(8.5)
    t2.textColor = DIM
    row.addSpacer()
    /* 两个环并排：药学（紫）+ 英语（青绿），一个组件里就能看到两边的今日进度 */
    if (d) row.addImage(drawRing(total ? Math.round(dc / total * 100) : 0, TH.ring, 30, 3, dc + "/" + total))
    if (es) {
      if (d) row.addSpacer(4)
      const lb = row.addText("英")
      lb.font = Font.semiboldSystemFont(9)
      lb.textColor = TH.en
      row.addSpacer(1)
      row.addImage(drawRing(es.n ? Math.round(es.done / es.n * 100) : 0, TH.en, 28, 3, es.done + "/" + es.n))
    }
    /* 政治环不写字，三个环并排已经不宽裕 */
    const pds = polToday(iso)
    if (pds) {
      const pDn = pds.tasks.filter(t => S.done[tid(t)]).length
      row.addSpacer(4)
      row.addImage(drawRing(pds.tasks.length ? Math.round(pDn / pds.tasks.length * 100) : 0, SUB.pol.c, 26, 2, null))
    }
  }

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
    const t2 = lf.addText(d ? d.date.slice(5).replace("-", "/") + " " + d.wd + " · " + dc + "/" + d.tasks.length + " 条 · v" + UI_VER : "阶段一结束")
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
  
  /* 任务行：药学整行点一下直通 B站、英语直通新东方回放；底部一张 AI 文字卡 */
  function widgetTasks(w, P, S, d, maxN, ai) {
    const iso = d ? d.date : todayISO()
    const es = enStatOf(iso, S)
    const pTodo = d ? d.tasks.filter(t => !S.done[tid(t)]) : []
    /* 政治：三科同一个组件里显示，不另开脚本 */
    const pdw = polToday(iso)
    const gTodo = pdw ? pdw.tasks.filter(t => !S.done[tid(t)]) : []
    /* 英语：按原顺序（先做题再看课），但单词垫后、保证「听课」这一行排在前两条里（要跳新东方） */
    const eRaw = es ? es.ed.tasks.filter(t => !S.done[enTid(es.ed.date, t)]) : []
    const eTodo = eRaw.filter(t => t.type !== "word").concat(eRaw.filter(t => t.type === "word"))
    if (eTodo.length > 1) {
      const wi = eTodo.findIndex(t => t.type === "watch")
      if (wi > 1) eTodo.splice(1, 0, eTodo.splice(wi, 1)[0])
    }

    /* 三科分名额：药学 per+1、英语 per、政治 per（中号 per=1 共 4 行，大号 per=3 共 10 行），
       多出来的空位按「药学 → 英语 → 政治」顺序回填，某一科没任务也不会留白 */
    const big = maxN >= 8
    const per = big ? 3 : 1
    let pShown = pTodo.slice(0, per + 1)
    let eShown = eTodo.slice(0, per)
    let gShown = gTodo.slice(0, per)
    for (const grow of ["p", "e", "g"]) {
      const left = maxN - pShown.length - eShown.length - gShown.length
      if (left <= 0) break
      if (grow === "p") pShown = pTodo.slice(0, pShown.length + left)
      else if (grow === "e") eShown = eTodo.slice(0, eShown.length + left)
      else gShown = gTodo.slice(0, gShown.length + left)
    }
    const rest = (pTodo.length - pShown.length) + (eTodo.length - eShown.length) + (gTodo.length - gShown.length)

    const rows = w.addStack()
    rows.layoutVertically()
    rows.spacing = 2
    if (!pTodo.length && !eTodo.length && !gTodo.length && d) {
      const t = rows.addText("今天全部打完了 ✓")
      t.font = Font.semiboldSystemFont(12)
      t.textColor = TH.ok
    }
    pShown.forEach(t => {
      const r = rows.addStack()
      r.layoutHorizontally()
      r.centerAlignContent()
      r.url = t.url                                  // 整行点一下 = 直通 B站
      const dot = r.addText("○")
      dot.font = Font.boldSystemFont(10)
      dot.textColor = SUB[t.sub].c
      r.addSpacer(4)
      const tx = r.addText(t.key + " " + shortTitle(t))
      tx.font = Font.systemFont(10.5)
      tx.textColor = new Color("#E4DEF6")
      tx.lineLimit = 1
      r.addSpacer(4)
      const b = r.addText("▶ B站")
      b.font = Font.semiboldSystemFont(9)
      b.textColor = TH.link
    })
    /* 英语行：dot 位写成「英」，右侧标签是「▶ 课」（新东方回放） */
    eShown.forEach(t => {
      const r = rows.addStack()
      r.layoutHorizontally()
      r.centerAlignContent()
      /* 小组件里没有可点的按钮，点整行 = 打开小满本身（英语播放一律去 App） */
      r.url = "scriptable:///run/" + encodeURIComponent(Script.name())
      const dot = r.addText("英")
      dot.font = Font.boldSystemFont(9.5)
      dot.textColor = TH.en
      r.addSpacer(3)
      const tx = r.addText(enShort(t.title))
      tx.font = Font.systemFont(10.5)
      tx.textColor = new Color("#D8F6F0")
      tx.lineLimit = 1
      tx.minimumScaleFactor = 0.85
      r.addSpacer(4)
      if (t.url) {
        const b = r.addText("▶ 课")
        b.font = Font.semiboldSystemFont(9)
        b.textColor = TH.link
      }
    })
    /* 政治行：有 B 站链接的整行点开直接播；新东方/背记类点开进小满 */
    gShown.forEach(t => {
      const r = rows.addStack()
      r.layoutHorizontally()
      r.centerAlignContent()
      r.url = t.url || ("scriptable:///run/" + encodeURIComponent(Script.name()))
      const dot = r.addText("政")
      dot.font = Font.boldSystemFont(9.5)
      dot.textColor = SUB.pol.c
      r.addSpacer(3)
      const tx = r.addText(String(t.title || "")
        .replace(/^27考研政治/, "")
        .replace(/^肖1000题精讲 · /, "1000题 · ")
        .replace(/；.*$/, ""))
      tx.font = Font.systemFont(10.5)
      tx.textColor = new Color("#FFE3EE")
      tx.lineLimit = 1
      tx.minimumScaleFactor = 0.85
      r.addSpacer(4)
      const b = r.addText(t.url ? "▶ B站" : "App")
      b.font = Font.semiboldSystemFont(9)
      b.textColor = TH.link
    })

  
    w.addSpacer(3)
    const card = w.addStack()
    card.layoutHorizontally()
    card.centerAlignContent()
    card.spacing = 5
    card.backgroundColor = TH.card
    card.cornerRadius = 9
    card.setPadding(4, 7, 4, 7)
    card.url = "scriptable:///run/" + encodeURIComponent(Script.name())
    const sp = card.addText("✦")
    sp.font = Font.boldSystemFont(9.5)
    sp.textColor = TH.pink
    const tx = card.addText(ai.text)
    tx.font = Font.systemFont(9.5)
    tx.textColor = new Color("#EFEAFB")
    tx.lineLimit = 1
    tx.minimumScaleFactor = 0.82   /* 中号只有一行的高度，宁可字小一点也不截断 */
    card.addSpacer()
    if (rest > 0) {
      const m = card.addText("还 " + rest + " 条 →")
      m.font = Font.semiboldSystemFont(9)
      m.textColor = TH.link
    }
  }
  
  async function buildWidget(P, S) {
    const fam = config.widgetFamily || "medium"
    const iso = todayISO()
    const w = new ListWidget()
    w.setPadding(12, 15, 12, 15)
    const g = new LinearGradient()
    g.colors = [TH.bgTop, TH.bgMid, TH.bgLow]
    g.locations = [0, 0.52, 1]
    w.backgroundGradient = g
    /* 20 分钟一轮：过了 0 点最多 20 分钟，气泡里就换成新的一天那句 */
    w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000)
  
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
  
    /* 小号：左上「第 N 天 · 日期」，右上圆环 + 计数，中间白气泡（AI 寄语），底部小满立绘 */
    if (fam === "small") {
      w.setPadding(9, 12, 5, 12)
      w.url = runURL
      /* 小号只有一个环：药学 + 英语合起来算「今天还剩多少」，明细点开看 */
      const esS = enStatOf(iso, S)
      const pdS = polToday(iso)
      const pdDone = pdS ? pdS.tasks.filter(t => S.done[tid(t)]).length : 0
      const done = (d ? d.tasks.filter(t => S.done[tid(t)]).length : 0) + (esS ? esS.done : 0) + pdDone
      const total = (d ? d.tasks.length : 0) + (esS ? esS.n : 0) + (pdS ? pdS.tasks.length : 0)

      const hd = w.addStack()
      hd.layoutHorizontally()
      hd.centerAlignContent()
      const t1 = hd.addText(d ? "第 " + d.day + " 天 · " + d.date.slice(5).replace("-", "/") : "数据未同步")
      t1.font = Font.semiboldSystemFont(9)
      t1.textColor = TH.head
      hd.addSpacer()
      hd.addImage(drawRing(total ? Math.round(done / total * 100) : 0, TH.ring, 19, 2, null))
      const t2 = hd.addText(" " + done + "/" + total)
      t2.font = Font.semiboldSystemFont(8)
      t2.textColor = TH.ringTx

      /* 弹性弹簧：把「气泡 + 立绘」压到下半区，头顶气泡的观感 */
      w.addSpacer()
      const ai = await loadAI(d)
      const bub = w.addStack()
      bub.layoutHorizontally()
      bub.centerAlignContent()          /* ✦ 跟第一行文字基线对齐，不撑高气泡 */
      bub.backgroundColor = TH.bubBg
      bub.cornerRadius = 12
      bub.setPadding(4, 7, 4, 7)
      const star = bub.addText("✦ ")
      star.font = Font.boldSystemFont(8)
      star.textColor = TH.pink
      /* 两行式：字数压到 26 以内，配 lineLimit 2 + 自动缩字号，
         宁可字小一点也不截成「…」，那句甜话得说完 */
      const bt = bub.addText(shrink(ai.text, 26))
      bt.font = Font.systemFont(9)
      bt.textColor = TH.bubTx
      bt.lineLimit = 2
      bt.minimumScaleFactor = 0.75
      bt.leftAlignText()

      const pet = petImage()
      if (pet) {
        w.addSpacer(1)
        const c = w.addStack()
        c.layoutHorizontally()
        c.centerAlignContent()
        c.addSpacer()
        /* 立绘后面垫一圈淡紫柔光，暗紫底上就不显得像贴上去的贴纸 */
        const wrap = c.addStack()
        try { wrap.size = new Size(88, 88) } catch (e) {}   /* 个别版本 size 只读，取不到就别硬撑 */
        wrap.layoutHorizontally()
        wrap.centerAlignContent()
        wrap.backgroundImage = halo(88, TH.halo, 0.34)
        const im = wrap.addImage(pet)
        const pr = pet.size.width / pet.size.height
        im.imageSize = new Size(Math.round(72 * pr), 72)
        c.addSpacer()
      } else {
        w.addSpacer()
        const hint = w.addText("立绘未就绪，运行一次脚本即可")
        hint.font = Font.systemFont(8)
        hint.textColor = DIM
        hint.centerAlignText()
      }
      return w
    }
  
    /* 中号 / 大号：左侧信息 + 右侧小满 */
    const body = w.addStack()
    body.layoutHorizontally()
    body.centerAlignContent()

    const left = body.addStack()
    left.layoutVertically()
    miniHead(left, P, S, d)
    left.addSpacer(4)
    if (d || enStatOf(iso, S) || polToday(iso)) {
      const ai = await loadAI(d)
      widgetTasks(left, P, S, d, fam === "large" ? 10 : 4, ai)
    } else {
      const t = left.addText("这个阶段已经收口了")
      t.font = Font.systemFont(11)
      t.textColor = DIM
    }

    body.addSpacer(5)
    const pet = petImage()
    if (pet) {
      const ph = fam === "large" ? 146 : 100
      const box = ph + 14
      const wrap = body.addStack()
      try { wrap.size = new Size(box, box) } catch (e) {}
      wrap.layoutHorizontally()
      wrap.centerAlignContent()
      wrap.backgroundImage = halo(box, TH.halo, 0.24)
      const im = wrap.addImage(pet)
      const pr = pet.size.width / pet.size.height
      im.imageSize = new Size(Math.round(ph * pr), ph)
    }
    return w
  }
  /* ---------- 可滑动清单 ---------- */
  /* 行：高度可调，标题强制单行 —— 长标题交给 subtitle 承载，避免撑成三行把版面顶乱 */
  /* 副标题一长就会换行，而行高是固定的 → 文字直接压到下一行上（用户截图里那种重叠）。
     所以副标题一律先截断成一行，剩下的信息交给 ⓘ 详情看 ✓ */
  function cut(s, n) {
    const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim()
    const m = n || 40
    return t.length > m ? t.slice(0, m - 1) + "…" : t
  }

  function mrow(text, sub, color, h, lines) {
    const r = new UITableRow()
    r.height = h || (sub ? 52 : 44)
    const c = r.addText(text, sub || "")
    c.titleFont = Font.semiboldSystemFont(sub ? 14.5 : 14)
    c.subtitleFont = Font.systemFont(10.5)
    c.titleColor = color || TC.txt
    c.subtitleColor = TC.dim
    try { c.lineLimit = lines || 1 } catch (e) {}
    return r
  }
  
  /* ---------- 勾选控件（2026-10-27 改） ----------
     以前的坑：整行都绑了 onSelect 做勾选，想滑动清单、想点标题看课程时
     一不小心就勾上了（用户反馈「一点就勾上」）。
     Scriptable 的行内按钮只能落在右侧（行首放 ○/✓ 只是纯文字、点不动），
     所以：勾/取消只认行尾这个「○ / ✓」按钮；行内其它位置改成弹操作菜单，
     绝不静默改状态 ✓
     2026-10-29：行首那个 ○/✓ 文字前缀撤掉 —— 和行尾按钮重复，一行里两个圆圈
     分不清点哪个（用户反馈「右边打勾了左边圈还在」）。现在全行只有行尾这一个
     勾选钮，已完成靠「标题变绿 + 完成于 …」表示。 */
  function markBtn(r, on, onTap) {
    const b = r.addButton(on ? "✓" : "○")
    b.titleColor = on ? TC.ok : TC.dim
    try { b.width = 34 } catch (e) {}
    b.onTap = onTap
    return b
  }
  function toggleDone(S, key, reason, rerender) {
    if (S.done[key]) { RECENT_DEL[key] = Date.now(); delete S.done[key] } else S.done[key] = Date.now()
    saveProg(S)
    kick(reason)
    scheduleAppSync(S)
    rerender()
  }
  /* 点标题/空白处 → 弹菜单（完成 / 取消 / 播放），误触不会改动任何状态 */
  /* ---------- B 站播放方式（2026-10-30） ----------
     需求：点「▶」直接进 B 站 App 看视频，并且不要看到开屏广告。
     拆成两件事，各解决各的：
       1) 「进 App 并直达视频」= bilibili://video/{BV}[?p=N]，不经过首页推荐流 —— 默认模式；
       2) 「App 里没有开屏广告」= 开屏是客户端自己画的图，外部脚本点不到右下角「跳过」，
          也没有任何 URL 参数能跳过。唯一根治是在网络层把广告位抽空：
          用 Surge / Loon / Stash / Quantumult X / Shadowrocket 对
          app.bilibili.com/x/v2/splash/list 做 MITM，返回空列表，App 只能显示默认启动图。
          规则文件已托管在自己的 Pages 上（BILI_RULE_*），小满里「B站去开屏」一键复制。
     参考项目：blackmatrix7/ios_rule_script、fmz200/wool_scripts（同接口、同做法）。 */
  const F_PLAY = fm.joinPath(DIR, "player.json")
  const BILI_RULE_BASE = "https://1123user.github.io/349-checkin/bili/"
  const BILI_RULE_MOD = BILI_RULE_BASE + "bili-splash.sgmodule"   // Surge / Loon / Egern
  const BILI_RULE_STASH = "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/adblock/bilibili-adblock.stoverride"  // 完整版：开屏+信息流
  const BILI_RULE_QX = BILI_RULE_BASE + "bili-splash.conf"        // Quantumult X / Shadowrocket
  /* 一键安装（2026-11-02）：Stash 官方给了 link.stash.ws 转发，点一下就能把覆写导进去，
     不用再复制地址、再去 App 里粘贴。Surge / Loon 走各自的 scheme。 */
  /* 全 App 去开屏（2026-11-02）：通用去广告 727 条 + 淘宝 / B站开屏脚本，一个文件装完。
     银行 / 支付域名已从 MITM 里剔除，避免证书钉死。 */
  const ADS_RULE = "https://1123user.github.io/349-checkin/adblock/ads.stoverride"
  const STASH_ONE_TAP = "https://link.stash.ws/install-override/"
    + "1123user.github.io/349-checkin/adblock/ads.stoverride"
  const SURGE_ONE_TAP = "surge:///install-module?url=" + encodeURIComponent(BILI_RULE_MOD)
  const LOON_ONE_TAP = "loon://import?plugin=" + encodeURIComponent(BILI_RULE_MOD)
  const PLAY_MODES = [
    { k: "app", n: "B站 App", d: "深链直达视频页，弹幕 / 缓存 / 清晰度全都在（默认）｜多分P合集偶尔定位到上次那一P" },
    { k: "inapp", n: "小满内网页", d: "不启动 App，肯定没广告，功能少；分P定位准" },
    { k: "web", n: "Safari 网页", d: "网页版播放，无开屏广告，可后台 / 画中画；分P定位 100% 准" },
  ]
  const PLAY_DEF = "app"
  let PLAY_MODE = PLAY_DEF
  function playLabel(k) {
    const m = PLAY_MODES.find(x => x.k === (k || PLAY_MODE))
    return m ? m.n : PLAY_MODES[0].n
  }
  function loadPlayMode() {
    try {
      if (!fm.fileExists(F_PLAY)) return PLAY_MODE
      if (false) return PLAY_MODE
      const o = JSON.parse(fm.readString(F_PLAY))
      /* v2：默认从上一版的「小满内网页」改成「B站 App」，没打标记的旧文件一律按默认来 */
      if (o && o.v === 2 && PLAY_MODES.some(x => x.k === o.mode)) PLAY_MODE = o.mode
    } catch (e) {}
    return PLAY_MODE
  }
  function savePlayMode(k) {
    PLAY_MODE = k
    try { ensureDir(); fm.writeString(F_PLAY, JSON.stringify({ mode: k, v: 2 })) } catch (e) {}
  }
  /* 本机装了哪些能做 MITM 的代理 App —— 只用来给提示，不做判断 */
  const PROXY_APPS = [
    { n: "Surge", sch: ["surge"], mod: BILI_RULE_MOD },
    { n: "Loon", sch: ["loon"], mod: BILI_RULE_MOD },
    { n: "Stash", sch: ["stash"], mod: BILI_RULE_STASH },
    { n: "Egern", sch: ["egern"], mod: BILI_RULE_MOD },
    { n: "Quantumult X", sch: ["quantumult-x", "quantumultx"], mod: BILI_RULE_QX },
    { n: "Shadowrocket", sch: ["shadowrocket"], mod: BILI_RULE_QX },
  ]
  let _proxyHit = null
  function detectProxies() {
    if (_proxyHit) return _proxyHit
    let names = []
    try { names = URLScheme.all().map(s => String((s && s.name) || "").toLowerCase()) } catch (e) { names = [] }
    _proxyHit = PROXY_APPS.filter(p => p.sch.some(x => names.indexOf(x) >= 0))
    return _proxyHit
  }
  /* BV → av（2023 新算法；已用 B 站 API 三例核对一致）。
     必须用 BigInt：aid 早就超出 32 位，JS 按位与只在 32 位内有效。 */
  function bv2av(bvid) {
    const AB = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf"
    const ch = bvid.split("")
    let t = ch[3]; ch[3] = ch[9]; ch[9] = t
    t = ch[4]; ch[4] = ch[7]; ch[7] = t
    let v = 0n
    for (let i = 3; i < 12; i++) v = v * 58n + BigInt(AB.indexOf(ch[i]))
    return String((v & 2251799813685247n) ^ 23442827791579n)
  }
  /* 从 www / m 站的视频链接里抠出 BV 与分P */
  function biliParse(u) {
    const s = String(u || "")
    const m = s.match(/^https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i)
    if (!m) return null
    const p = (s.match(/[?&]p=(\d+)/) || [])[1]
    return { bv: m[1], p: p && p !== "1" ? p : "" }
  }
  function biliWeb(b) {
    return "https://m.bilibili.com/video/" + b.bv + (b.p ? "?p=" + b.p : "")
  }
  /* 网页播放：?p=N 是 B站自己认的参数，定位 100% 准。
     2026-11-01：App 深链在多分P合集里常常停在上一P（「点谁都进同一个视频」），
     所以不管当前是什么播放方式，详情里都留一个走网页的准入口。 */
  function openWeb(u) {
    const b = biliParse(String(u || ""))
    try { Safari.open(b ? biliWeb(b) : String(u)) } catch (e) {}
  }
  /* 每次点播放都留一行痕，出问题直接看 349打卡/play-log.txt 就知道发的是哪条深链 */
  function logPlay(deep, src) {
    try {
      const p = fm.joinPath(DIR, "play-log.txt")
      let old = ""
      try { if (fm.fileExists(p)) old = fm.readString(p) || "" } catch (e) {}
      const t = new Date().toISOString().slice(0, 19).replace("T", " ")
      const lines = (old + t + "  " + deep + "  ← " + src + "\n").split("\n").filter(Boolean).slice(-30)
      fm.writeString(p, lines.join("\n") + "\n")
    } catch (e) {}
  }
  /* B 站视频元数据（p 是否越界 / 视频是否还在）。
     缓存 6 小时；网络失败返回 ok:-1，一律放行，绝不因为查不到就不播。
     只做静默纠正，不弹任何提示。 */
  const F_BMETA = fm.joinPath(DIR, "bili-meta.json")
  function biliMeta(bv) {
    let c = {}
    try { if (fm.fileExists(F_BMETA)) c = JSON.parse(fm.readString(F_BMETA)) || {} } catch (e) { c = {} }
    const hit = c[bv]
    if (hit && (Date.now() - (hit.ts || 0)) < 6 * 3600 * 1000) return hit
    try {
      const r = new Request("https://api.bilibili.com/x/web-interface/view?bvid=" + bv)
      r.timeoutInterval = 3
      r.headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "Referer": "https://www.bilibili.com"
      }
      const d = r.loadJSON()
      let m
      if (!d || d.code !== 0 || !d.data) m = { ok: 0, ts: Date.now() }
      else {
        const pg = d.data.pages || []
        /* parts 留着点播时按标题纠偏：数据里的 P 号一旦写错（板块号当分P），
           用户点「人工合成抗菌药2」进的是第二章。有官方标题就能当场改对。 */
        m = { ok: 1, n: (pg.length || 1), ts: Date.now() }
        if (pg.length > 1 && pg.length <= 150) m.parts = pg.map(x => [x.page, String(x.part || "")])
      }
      c[bv] = m
      /* 缓存只留最近 24 支，别让它长成几百 KB */
      const ks = Object.keys(c).sort((a, b) => (c[b].ts || 0) - (c[a].ts || 0)).slice(0, 24)
      const cc = {}
      ks.forEach(k => { cc[k] = c[k] })
      try { fm.writeString(F_BMETA, JSON.stringify(cc)) } catch (e) {}
      return m
    } catch (e) { return { ok: -1 } }
  }
  /* 标题归一：只留中英文数字，避免「第4节 / 第四节」「A｜B」这类写法差异误判 */
  function plainTitle(s) {
    return String(s || "").replace(/[\s\u3000·、,，。:：\-—_（）()【】\[\]｜|\/]/g, "").toLowerCase()
  }
  /* 用任务标题在官方分P里反查真实 P 号；查不到返回 ""（宁可按原链接走，不瞎改） */
  function pickPage(parts, title) {
    const t = plainTitle(title)
    if (!t || t.length < 4) return ""
    let best = "", bestLen = 0
    parts.forEach(x => {
      const p = plainTitle(x[1])
      if (!p) return
      if (p === t) { best = String(x[0]); bestLen = 1e9; return }
      if (bestLen >= 1e9) return
      if (t.length >= 6 && (p.indexOf(t) >= 0 || t.indexOf(p) >= 0)) {
        const L = Math.min(p.length, t.length)
        if (L > bestLen) { best = String(x[0]); bestLen = L }
      }
    })
    return best
  }
  /* 全脚本唯一的播放出口：B 站按偏好走网页 / 内嵌 / App 深链，其它链接原样开 */
  function openPlay(u, title) {
    const url = String(u || "")
    if (!url) return
    let b = biliParse(url)
    if (!b) { try { Safari.open(url) } catch (e) {} return }
    /* 只有带分P才值得查（无分P的 video 深链本来就稳），尽量避免多点一次网络等待 */
    if (b.p) {
      const meta = biliMeta(b.bv)
      if (meta.ok === 0) {
        /* 视频已删/私密：深链必然掉首页，直接给网页，仍不弹窗 */
        logPlay("失效→网页 " + b.bv, url)
        try { Safari.open(biliWeb(b)) } catch (e) {}
        return
      }
      if (meta.ok === 1) {
        /* ① 数据里的 P 号写错（板块号当分P）→ 有官方标题就当场纠回来 */
        if (title && meta.parts && meta.parts.length > 1) {
          const fix = pickPage(meta.parts, title)
          if (fix && fix !== String(b.p)) {
            logPlay("按标题改P " + b.p + "→" + fix + " " + b.bv, url)
            b = { bv: b.bv, p: fix === "1" ? "" : fix }
          }
        }
        /* ② p 仍越界（合集删过稿 / 单P视频被塞了 p=4）→ 去掉 p，播这条视频本身 */
        if (b.p && Number(b.p) > meta.n) {
          logPlay("p越界 " + b.p + ">" + meta.n + "→去p", url)
          b = { bv: b.bv, p: "" }
        }
      }
    }
    if (PLAY_MODE === "app") {
      /* 2026-11-01 修「点今日推荐只进 B站首页」：
         Safari.open 是同步的、返回 undefined，旧代码 `if (pr && pr.catch) … else vd()`
         永远走 else —— 先发 play?aid 深链，紧接着又发 video 深链，App 还在启动就被
         第二条打断，最后停在首页。分P仍走 play?aid（aid 已用官方 API 三例核对），
         但只发一次，不再补第二枪。 */
      const deep = b.p
        ? "bilibili://play?aid=" + bv2av(b.bv) + "&p=" + b.p
        : "bilibili://video/" + b.bv
      logPlay(deep, url)
      try { Safari.open(deep) }
      catch (e) { try { Safari.open(biliWeb(b)) } catch (e2) {} }
      return
    }
    if (PLAY_MODE === "web") { try { Safari.open(biliWeb(b)) } catch (e) {} return }
    /* 内嵌：SFSafariViewController 不会把 universal link 甩给 App，登录态与 Safari 共用 */
    try { Safari.openInApp(biliWeb(b)) } catch (e) { try { Safari.open(biliWeb(b)) } catch (e2) {} }
  }
  /* 跨端同步方式：夜间批量 / 勾完即时 / 关闭 */
  async function syncModeSheet(rerender) {
    const a = new Alert()
    a.title = "跨端同步 · 当前「" + syncLabel() + "」"
    a.message = "勾选怎么送到二轮复习 App。\n\n"
      + "· 夜间批量（推荐）：白天勾完只记着，当晚 22:00 后第一次打开小满时一次性推 —— "
      + "不再勾一条就被系统弹「在小满中打开二轮复习」。\n"
      + "· 勾完即时：老行为，停手 2.5 秒唤起 App。\n"
      + "· 关闭：只存本机，永远不唤起 App。"
    a.addAction("夜间批量（默认）")
    a.addAction("勾完即时")
    a.addAction("关闭")
    a.addCancel("取消")
    const i = await a.presentAlert()
    if (i === 0) saveSyncSt({ mode: "night" })
    else if (i === 1) { saveSyncSt({ mode: "instant" }); if (rerender) rerender() }
    else if (i === 2) saveSyncSt({ mode: "off" })
    else return
    if (rerender) rerender()
  }
  async function playModeSheet(rerender) {
    loadPlayMode()
    const a = new Alert()
    a.title = "B站播放方式 · 当前「" + playLabel() + "」"
    a.message = PLAY_MODES.map(x => (x.k === PLAY_MODE ? "● " : "○ ") + x.n + "：" + x.d).join("\n")
      + "\n\n「B站 App」这一档只解决「直达视频、不绕首页」；"
      + "App 自己的开屏广告要在下面「B站去开屏」里装一次代理规则才会消失。"
    PLAY_MODES.forEach(x => a.addAction(x.n))
    a.addCancelAction("不改")
    const i = await a.present()
    if (i >= 0 && i < PLAY_MODES.length) {
      savePlayMode(PLAY_MODES[i].k)
      if (rerender) rerender()
    }
  }

  /* 去开屏：一次性装 MITM 规则，之后 App 冷启动只剩默认启动图 */
  function tipCopied(what, url, kind) {
    const b = new Alert()
    b.title = "已复制" + what
    b.message = url + "\n\n"
      + (kind === "stash"
        ? "Stash：首页「配置」区 → 覆写 → 右上角 + → 从 URL 安装，粘上这条地址。\n"
          + "注意 Stash 不吃 Surge 的 .sgmodule，必须是这个 .stoverride。\n"
          + "若提示「下载失败」：先在 Stash 里把 MitM 关掉再试（证书没信任时所有 HTTPS 都会被拦），"
          + "关掉还不行就用「文件」App 打开 iCloud Drive 里的「B站去开屏.stoverride」，"
          + "长按 → 共享 → Stash，本地导入不走网络。"
        : kind === "mod"
        ? "Surge / Loon / Egern：进「模块」→ 从 URL 安装 / 新建远程模块，粘上这段地址。"
        : "Quantumult X：配置文件 [rewrite_local] 段加一行脚本重写（地址里那条 .conf 有现成两段）。\n"
          + "Shadowrocket：配置 → 重写 → 远程重写，粘这段地址。")
      + "\n\n装完还要做一件事：打开代理的 MitM，安装并信任证书"
      + "（设置 → 通用 → 关于本机 → 证书信任设置里打开那条根证书），否则规则不生效。"
      + "\n出站策略保持 DIRECT / 直连，别开全局代理 —— 这条规则只在本地改写响应，不需要任何节点。"
    b.addAction("好")
    b.present()
  }
  /* 装完之后必经的一步：MitM 证书 */
  function tipInstalled(name) {
    const b = new Alert()
    b.title = "已交给 " + name + " 打开安装页"
    b.message = "在弹出来的 " + name + " 页面里点「安装 / 导入」，规则就进来了。\n\n"
      + "还差最后一步（不做就完全不生效）：\n"
      + "① " + name + " → 设置 → MitM → 打开 MitM，生成 CA 证书并安装描述文件\n"
      + "② 系统 设置 → 通用 → 关于本机 → 证书信任设置 → 把那条 CA 打开\n"
      + "③ 杀掉目标 App 重进一次\n\n"
      + "出站策略保持直连（DIRECT）就行，这条规则只在本地改写响应，不烧流量、不需要节点。\n\n"
      + "❗若报「下载配置失败」：多半是 MitM 已开但证书还没信任，Stash 自己的 HTTPS 也被拦了 ——"
      + "先到 设置 → MitM 把开关关掉，再点一次安装；还不行就用「文件」App 里 iCloud Drive 的"
      + "「去开屏/ads.stoverride」，长按 → 共享 → Stash，本地导入不走网络。"
    b.addAction("好了")
    b.present()
  }
  /* 去开屏 / 去广告（2026-11-02 扩成全 App）
     一个文件装完：通用去广告 727 条 + 淘宝 / B站 开屏脚本（payload 内联，不依赖 GitHub raw）。
     银行 / 支付域名已从 MITM 剔除，避免证书钉死让银行 App 打不开。 */
  async function noSplashSheet() {
    const found = detectProxies()
    const a = new Alert()
    a.title = "去开屏 / 去广告" + (found.length ? " · 检测到 " + found.map(x => x.n).join(" / ") : "")
    a.message = "一套规则同时干两件事：\n"
      + "① 通用去广告（727 条规则 / 686 个域名）—— 各 App 的广告位、横幅、信息流\n"
      + "② 开屏专项 —— 淘宝（只让广告素材与时长失效，不动推荐 / 搜索 / 订单 / 支付）、"
      + "B站（清空 splash/list）\n\n"
      + "银行 / 支付类域名没有放进 MITM，不会把银行 App 弄打不开；"
      + "出站留直连（DIRECT）即可，不需要节点、不烧流量。\n\n"
      + "装法（一次就够）：\n"
      + "1) 点最上面那行，Stash 自己打开导入页 → 安装\n"
      + "2) Stash → 设置 → MitM → 打开，生成 CA 证书并安装描述文件\n"
      + "3) 系统 设置 → 通用 → 关于本机 → 证书信任设置 → 打开那条 CA\n"
      + "4) 杀掉目标 App 重进\n\n"
      + "已知还没有专项规则的开屏：抖音、闲鱼、大众点评、剪映、爱奇艺、网易云 —— "
      + "碰上了说一声，按 App 补（补之前先抓包看它走哪个接口）。"
    a.addAction("① 一键安装到 Stash")
    a.addAction("② 复制覆写地址（手动导入）")
    a.addAction("③ 只要 B站 的轻量规则")
    a.addCancelAction("关闭")
    const i = await a.present()
    if (i === 0) { try { Safari.open(STASH_ONE_TAP) } catch (e) {} tipInstalled("Stash") }
    else if (i === 1) { Pasteboard.copy(ADS_RULE); tipCopied("覆写地址", ADS_RULE, "stash") }
    else if (i === 2) { Pasteboard.copy(BILI_RULE_STASH); tipCopied("B站覆写地址", BILI_RULE_STASH, "stash") }
  }

  /* 链接缩成一眼能看懂的形式：B 站给 BV + 分P，其它给域名 + 尾段 */
  function shortUrl(task) {
    const u = String(task.url || "")
    let m = u.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/)
    if (m) {
      const p = (u.match(/[?&]p=(\d+)/) || [])[1]
      return "B站 " + m[1] + (p ? " · P" + p : "")
    }
    m = u.match(/^https?:\/\/([^\/]+)(\/[^?#]*)?/)
    if (m) return m[1] + (m[2] && m[2] !== "/" ? m[2] : "")
    return u
  }

  /* 完成时间（毫秒）→ "10/28 15:34" */
  function fmtStamp(ms) {
    if (!ms) return ""
    const t = new Date(ms)
    const p = n => (n < 10 ? "0" : "") + n
    return (t.getMonth() + 1) + "/" + t.getDate() + " " + p(t.getHours()) + ":" + p(t.getMinutes())
  }

  /* 任务详情弹窗（2026-10-28，2026-11-03 修炸弹）
     用户反馈：勾完之后条目就从列表里消失，点不进去看「到底完成的是什么」。
     ⚠ 根因：Scriptable 的 Alert.addAction() 返回 undefined（官方文档没有
     AlertAction/handler 这套 API），原写法 .handler = … 一点就抛
     TypeError: undefined is not an object。正确姿势是 addAction 只管加按钮，
     present() 返回被点的索引（取消恒为 -1），再按索引分发。
     extras：[{label, run}] 可选附加按钮（政治 memo 任务用它跳政治线板块）。 */
    function taskSheet(task, on, doToggle, playText, doPlay, doneAt, extras) {
      const a = new Alert()
      a.title = String(task.title || "")
      const msg = []
      if (on && doneAt) msg.push("✅ 完成于 " + fmtStamp(doneAt))
      const meta = []
      if (task.sub && SUB[task.sub]) meta.push(SUB[task.sub].name)
      if (task.dur) meta.push(task.dur)
      if (task.level) meta.push(task.level)
      if (meta.length) msg.push(meta.join(" · "))
      if (task.group) msg.push("章节：" + task.group)
      if (task.loc) msg.push("📍" + task.loc)
      if (task.note) msg.push(task.note)
      if (task.url) msg.push("🔗 " + shortUrl(task))
      a.message = msg.join("\n")
      const acts = [{ label: on ? "取消勾选" : "标记完成", run: doToggle }]
      if (doPlay) {
        acts.push({ label: playText || "▶ 播放", run: doPlay })
        acts.push({ label: "🌐 网页打开（分P最准）", run: () => openWeb(task.url) })
      }
      ;(extras || []).forEach(x => acts.push(x))
      acts.forEach(x => a.addAction(x.label))
      a.addCancelAction("返回")
      a.present().then(i => {
        if (i >= 0 && i < acts.length && acts[i].run) {
          try { acts[i].run() } catch (e) { console.error("taskSheet action: " + e) }
        }
      })
    }

  function head(text, note, onTap, btn) {
    const r = new UITableRow()
    r.height = 32
    r.isHeader = true
    const c = r.addText(text, note || "")
    c.titleFont = Font.boldSystemFont(12)
    c.subtitleFont = Font.systemFont(10)
    c.titleColor = onTap ? TC.link : TC.dim
    c.subtitleColor = TC.dim
    if (onTap) {
      /* 2026-11-01：科目标题行可点 —— 点「药学 6/8 · 208 分钟」直接进这一科当天的完整清单 */
      r.dismissOnSelect = false
      r.onSelect = onTap
      const b = r.addButton(btn || "全部")
      b.titleColor = TC.link
      b.onTap = onTap
    }
    return r
  }
  
  function taskRows(t, P, S, d, rerender, compact) {
    d.tasks.forEach(task => {
      const on = !!S.done[tid(task)]
      /* compact（2026-11-01）：主界面每条只占一行——科目 · 时长 · 程度。
         note（做：… 需再看：…）这些长说明全部收进 ⓘ 和科目详情页，主界面不再撑出第二三行 */
      const sb = on
        ? SUB[task.sub].name + " · " + task.dur + " · 完成于 " + (fmtStamp(S.done[tid(task)]) || "—")
        : SUB[task.sub].name + " · " + task.dur + " · " + task.level
          + (compact ? "" : (task.note ? " · " + task.note : ""))
      const r = mrow(
        stripPrefix(task.title),
        cut(sb, compact ? 34 : 38),
        on ? TC.ok : (TC[task.sub] || TC.txt), compact ? 46 : 58, compact ? undefined : 2
      )
      r.dismissOnSelect = false
      r.onSelect = () => taskSheet(task, on,
        () => toggleDone(S, tid(task), "task", rerender),
        (/bilibili|b23\.tv/.test(task.url || "") ? "▶ B站播放" : "▶ 打开页面"), task.url ? () => openPlay(task.url, task.title) : null,
        S.done[tid(task)])
      if (task.url) {
        const b = r.addButton("▶")
        try { b.width = 36 } catch (e) {}
        b.titleColor = TC.link
        b.onTap = () => openPlay(task.url, task.title)
      }
      const dbi = r.addButton("ⓘ")
      dbi.titleColor = TC.link
      try { dbi.width = 26 } catch (e) {}
      dbi.onTap = () => taskSheet(task, on, () => toggleDone(S, tid(task), "task", rerender),
        task.url ? "▶ B站播放" : null,
        task.url ? () => openPlay(task.url, task.title) : null, S.done[tid(task)])
      markBtn(r, on, () => toggleDone(S, tid(task), "task", rerender))
      t.addRow(r)
    })
  }
  
  /* 单个科目的日程页（2026-10-28）
     用户口径：主界面只看「还没做的」，点科目名单独进去看这一科的全部日程 ——
     像打开一张独立的工作表单，只有这一科，不串别的科目。 */
  function subjTable(P, S, d, k) {
    const t = new UITable()
    t.showSeparators = false
    const render = () => {
      t.removeAllRows()
      const ts = d.tasks.filter(x => x.sub === k)
      const dn = ts.filter(x => S.done[tid(x)])
      const un = ts.filter(x => !S.done[tid(x)])
      // 这一科自己的时长（以前写的是当天三科合计，看着像「有机要 221 分钟」✗）
      const smin = Math.round(ts.reduce((a, x) => a + (x.sec || 0), 0) / 60)
      t.addRow(head((SUB[k] ? SUB[k].name : k) + " · 第 " + d.day + " 天 · "
        + d.date.slice(5).replace("-", "/") + " " + d.wd,
        dn.length + "/" + ts.length + " 已完成 · " + smin + " 分钟"))
      if (un.length) {
        t.addRow(head("待完成 " + un.length + " 条", ""))
        taskRows(t, P, S, { date: d.date, tasks: un }, render)
      }
      if (dn.length) {
        t.addRow(head("已完成 " + dn.length + " 条 · 点 ⓘ 看详情", ""))
        taskRows(t, P, S, { date: d.date, tasks: dn }, render)
      }
      if (!ts.length) t.addRow(mrow("这一科今天没有安排", "", TC.dim, 44))
      t.reload()
    }
    render()
    return t
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
        const dn = ts.filter(x => S.done[tid(x)]).length
        /* 科目在这里是「小单位」：标题行点一下 → 只看这一科（独立表单） ✓ */
        const hr = mrow(SUB[k].name + "　" + dn + "/" + ts.length, "点开只看这一科",
          dn === ts.length ? TC.ok : (TC[k] || TC.txt), 46)
        hr.dismissOnSelect = false
        const openSub = async () => {
          await subjTable(P, S, d, k).present(true)
          kick("subj")
          render()
        }
        hr.onSelect = openSub
        const hb = hr.addButton("打开")
        hb.titleColor = TC.link
        hb.onTap = openSub
        t.addRow(hr)
        taskRows(t, P, S, { date: d.date, tasks: ts }, render)
      })
      tomorrowBlock(t, d.date)
      recBlock(t, d.date)
      t.reload()
    }
    render()
    return t
  }
  
  /* ★ 英语课程的打开方式（2026-10-25 实测结论）
     新东方在线没有 Universal Links（study.koolearn.com 的 apple-app-site-association 是 404），
     也没有网页 smart banner，唯一能唤起 App 的是自定义 scheme koolearn://
     ——它的规则是：scheme 后面的整串内容会被当成「搜索词」塞进 App 搜索框，不做路由匹配。
     所以这里把课时名清洗成搜索词塞进去，点一下就落到 App 的搜索结果页；
     想要原来的「Safari 直达该课时网页」把 EN_OPEN 改成 "web" 即可。 */
  function enSearchWord(task) {
    const raw = String(task.title || "")
    /* 单词任务（「单词 20 分钟（恋练有词 新单元）」）不是一节课，整串拿去搜什么都搜不到；
       它对应的是词汇课「恋练有词」本身 —— 搜索词只取书名，才落得到那门课 ✓ */
    if (task.type === "word") {
      /* 现在的单词任务是「单词 20 分钟 · 恋词精讲 Unit01-1 00:00–20:00」，
         直接拿 Unit 号去搜最准；老格式「（恋练有词 新单元）」则退回书名 */
      const u = raw.match(/Unit\s*\d+\s*-\s*\d+/i)
      if (u) return "恋练有词 " + u[0].replace(/\s+/g, "")
      const m = raw.match(/[（(]([^（）()]{2,14})[）)]/)
      const book = (m ? m[1] : "").replace(/新单元|新的一单元|复习|二刷|单词|\d{1,2}:\d{2}.*$/g, "").trim()
      return book || "恋练有词"
    }
    return raw
      .replace(/^听\s*/, "")
      .replace(/[·•].*$/, "")
      .replace(/[（(]\s*限时[^）)]*[）)]/g, "")
      .trim()
  }

  /* 深链：关键词必须 encodeURIComponent 后直接跟在 scheme 后（占 host 位）。
     Foundation 实测：koolearn://2024%20%E9%98%85%E8%AF%BB 解析出 host = "2024 阅读"（自动解码）；
     写成 koolearn:///词 则 host 为 nil，App 认不出；写中文原文直接 NIL 非法。
     App 把 host+path 整串当搜索词，所以这里 host 就是课时名。 */
  /* patch-enapp-20261031 —— 点播放直接进「新东方在线」App
     2026-10-25 的结论仍然成立：Safari.open("koolearn://…") 静默失败、
     URLScheme.open 同样失败，只有 WebView 内用户手势点击放行。
     所以这里给一个中转页：加载后先自动跳一次，被系统拦了就靠那个大按钮。
     页面上顺带保留「网页里播放」兜底，单词课不给（网页端本来没回放）。 */
  async function enAppBridge(task) {
    const link = enDeepLink(task)
    const word = enSearchWord(task) || "考研英语"
    const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const title = esc(task.title)
    const loc = esc(task.loc)
    const web = enPlayerUrl(task)
    const showWeb = /koolearn\.com/.test(web) && task.type !== "word"
    const jsLink = JSON.stringify(link)
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:dark}
body{margin:0;padding:26px 20px 22px;background:#0b0b0d;color:#f2f2f5;
     font:16px/1.55 -apple-system,"PingFang SC",sans-serif}
h1{font-size:17.5px;line-height:1.45;margin:0 0 8px;font-weight:600}
.loc{margin:0 0 20px;color:#8e8e96;font-size:13px;line-height:1.5}
a{display:block;text-align:center;text-decoration:none;border-radius:15px}
.big{padding:17px;background:#ffd60a;color:#111;font-weight:700;font-size:17px}
.sub{padding:14px;background:#1b1b1f;color:#9dc0ff;border:1px solid #2b2b31;
     margin-top:12px;font-size:15px}
p.tip{color:#75757d;font-size:12.5px;margin:18px 0 0;line-height:1.65}
b{color:#b9b9c2;font-weight:600}
</style></head><body>
<h1>${title}</h1>
<div class="loc">${loc || "2027考研英语全程班 5班"}</div>
<a class="big" href="${link}">打开「新东方在线」App</a>
${showWeb ? `<a class="sub" href="${web}">在网页里播放</a>` : ""}
<p class="tip">没反应就点上面那个黄按钮。<br>搜索词已带好：<b>${esc(word)}</b>；搜不到就进
「我的课程 › 2027考研英语全程班 5班」按目录找这节课。</p>
<script>setTimeout(function(){try{location.href=${jsLink}}catch(e){}},280)<\/script>
</body></html>`
    const w = new WebView()
    await w.loadHTML(html, "https://study.koolearn.com/")
    await w.present(false)
  }

  function enDeepLink(task) {
    /* 2026-10-31 关键纠正：App 真正注册的 scheme 是 koolearnmotion
       （bundle id = com.koolearn.koolearnMotion，从 app.koolearn.com 的
       apple-app-site-association 里拿到，App Store 已核实同名）。
       koolearn:// 这个 scheme 压根不存在，所以 2026-10-25 那次
       「进程主动 openURL 会被系统拦」的结论是误判 —— 当时打开的是一个
       不存在的地址，当然没有任何反应。
       先不带参数：确认能唤起后，再加搜索词试 host 传参。 */
    return "koolearnmotion://"
  }

  /* 把课程链接统一改写成页面班真正的播放页 /ky/learning/{courseId}/{classId}/{lessonId}
     （实测：/ky/live/enterlive/... 会 302 回 /my，只能落到课程目录；
        /ky/learning/... 返回 200 且内含 player 脚本，登录后直接播放） */
  function enPlayerUrl(task) {
    const u = String((task && task.url) || "")
    /* /ky/next/{courseId}/{classId}/{pkgId}/{lessonId}/{seq} 是课程目录里点课时给出的原文地址
       （2026-10-25 从页面 data-url 抓到的），原样用最保险 ✓ */
    if (/^https?:\/\/study\.koolearn\.com\/ky\/next\/\d+\/\d+\/\d+\/\d+\//.test(u)) return u
    let m = u.match(/\/ky\/live\/enterlive\/(\d+)\/(\d+)\/(\d+)/)
    if (m) return "https://study.koolearn.com/ky/learning/" + m[1] + "/" + m[2] + "/" + m[3]
    m = u.match(/\/ky\/next\/(\d+)\/\d+\/(\d+)\/(\d+)/)
    if (m) return "https://study.koolearn.com/ky/learning/" + m[1] + "/" + m[2] + "/" + m[3]
    return u
  }


  /* 2026-10-31 定型（逆向过官方 APK 后的结论）：
     App 只开放了首页级深链 koolearnmotion://，课程级跳转做不到
     （安卓的 xdfk://p / koolearn:// 是给原生-H5 桥用的，iOS 侧没有对应实现）。
     所以分两条路：
     · 有播放链接的课 → 走网页 /ky/next/… 或 /ky/learning/…，一次点击直接开播
     · 无链接的任务（单词/动笔）→ 只能在 App 里做，唤起 App + 通知提示目录路径 */
    async function openEnLink(task) {
    if (!task) return
    const u = String(task.url || "")
    /* 王无术技巧课在 B 站，App 里搜不到，仍直接播 */
    if (/^https?:/i.test(u) && u.indexOf("koolearn") < 0) { openPlay(u, task.title); return }
    /* 新东方课程：网页播放页直达（登录态与 Safari 共享，未登录会 302 到登录页） */
    const pageUrl = enPlayerUrl(task)
    if (/^https?:\/\//i.test(pageUrl)) { Safari.open(pageUrl); return }
    /* 兜底：没有任何链接的任务，只能进 App */
    try {
      const n = new Notification()
      n.title = task.title || "英语任务"
      n.body = (task.loc || "我的课程 › 2027考研英语全程班 5班") + "\n按这个路径找"
      n.schedule()
    } catch (e) {}
    Safari.open(enDeepLink(task))
  }


  /* 新东方登录入口（2026-10-25 起）：
     掉线根因是 Safari 侧 login_token 不是 HttpOnly，会被 ITP 在 7 天无交互后清掉；
     而 SFSafariViewController 每次都是新会话，所以清了就得重登。
     App 内登录态独立、长期有效，所以主推「App 内登录」，网页登录只做兜底。
     App 深链必须由用户手势触发，所以这里仍走 WebView 中转页。 */
  async function openKoolearnLogin() {
    /* 只剩 Safari 一条路（App 深链不认、App 里也没搜索框）：
       SFSafariViewController 与 Safari 共享存储，在这里登录一次，点课就能直接播。
       用 /my 而不是课程页：实测 /my 未登录时直接 302 到
       login.koolearn.com/sso/m/toLogin.do?next_page=/my —— 一步就是登录页，
       登录完还回「我的」，比课程页（先 302 到 /my 再 302 到登录）少一跳 */
    Safari.open("https://study.koolearn.com/my")
  }

  /* 政治 memo 任务的板块跳转（2026-11-03）：这类任务没有链接，
     点了不知道去哪。按标题关键词在政治线（POL.days）里找对应板块的
     带视频日期，弹窗里给「▶ M/D 标题」按钮，点了直接开那天的清单。 */
  function polMemoExtras(task, S, rerender) {
    if (!POL || task.type !== "memo") return []
    const t = String(task.title || "")
    const kws =
      t.indexOf("概念卡") >= 0 ? ["思法"] :
      t.indexOf("错题") >= 0 ? ["精练", "习题"] :
      (t.indexOf("马原") >= 0 || t.indexOf("多选") >= 0 || t.indexOf("正误") >= 0) ? ["马哲"] : null
    if (!kws) return []
    const hits = []
    POL.days.forEach(d => d.tasks.forEach(v => {
      const ok = v.type === "video" && v.url &&
        kws.some(k => String(v.title || "").indexOf(k) >= 0)
      if (ok && !hits.some(h => h.date === d.date)) hits.push({ date: d.date, title: v.title })
    }))
    return hits.slice(0, 3).map(h => ({
      label: "▶ " + h.date.slice(5).replace("-", "/") + " " + cut(h.title, 16),
      run: () => polDayTable(S, POL.days.find(d => d.date === h.date), rerender).present(true)
    }))
  }

  /* 政治任务行：视频点右侧「▶ B站」直接播；新东方冲刺/模考点「App」给路径提示；
     勾选一律走行尾「○ / ✓」，点标题只弹菜单（不会误勾） */
  function polRows(t, S, pd, rerender, compact) {
    pd.tasks.forEach(task => {
      const id = tid(task)
      const on = !!S.done[id]
      const sub = task.type === "video"
        ? "B站 · " + (task.note || "精讲")
        : task.type === "app" ? "新东方 App 内看" : (task.note || "背记 / 复盘")
      const r = mrow(task.title,
        cut(on ? ((task.dur ? task.dur + " · " : "") + "完成于 " + (fmtStamp(S.done[id]) || "—"))
           : ((task.dur ? task.dur + " · " : "") + sub), compact ? 34 : 38),
        on ? TC.ok : TC.pol, compact ? 46 : 58, compact ? undefined : 2)
      r.dismissOnSelect = false
      const extras = polMemoExtras(task, S, rerender)
      const appTip = () => {
        const a = new Alert()
        a.title = "在新东方 App 里看"
        a.message = "「新东方在线」→ 我的课程 → 2027考研政治全程班 5班，找到：\n\n【" + task.title + "】"
        a.addCancelAction("好")
        a.present()
      }
      r.onSelect = () => {
        if (on) {
          return taskSheet(task, on, () => toggleDone(S, id, "pol", rerender),
            task.url ? "▶ B站播放" : null,
            task.url ? () => openPlay(task.url, task.title) : (task.type === "app" ? appTip : null),
            S.done[id], extras)
        }
        if (task.url) return openPlay(task.url, task.title)
        if (task.type === "app") return appTip()
        taskSheet(task, on, () => toggleDone(S, id, "pol", rerender), null, null, S.done[id], extras)
      }
      if (task.url) {
        const b = r.addButton("▶")
        try { b.width = 36 } catch (e) {}
        b.titleColor = TC.link
        b.onTap = () => openPlay(task.url, task.title)
      } else if (task.type === "app") {
        const b = r.addButton("App")
        try { b.width = 40 } catch (e) {}
        b.titleColor = TC.link
        b.onTap = () => appTip()
      }
      const dbp = r.addButton("ⓘ")
      dbp.titleColor = TC.link
      try { dbp.width = 26 } catch (e) {}
      dbp.onTap = () => taskSheet(task, on, () => toggleDone(S, id, "pol", rerender),
        task.url ? "▶ B站播放" : null,
        task.url ? () => openPlay(task.url, task.title) : (task.type === "app" ? appTip : null),
        S.done[id], extras)
      markBtn(r, on, () => toggleDone(S, id, "pol", rerender))
      t.addRow(r)
    })
  }

  /* 政治的单日完整清单（2026-11-01）：主界面点「政治 N/3」进来，只看政治这一科 */
  function polDayTable(S, pd, rerender) {
    const t = new UITable()
    t.showSeparators = false
    const rr = () => {
      t.removeAllRows()
      const done = pd.tasks.filter(x => S.done[tid(x)]).length
      t.addRow(head("政治 · " + pd.date.slice(5).replace("-", "/") + " " + pd.wd,
        done + "/" + pd.tasks.length + " 已完成 · " + pd.min + " 分钟" + (pd.focus ? " · " + cut(pd.focus, 24) : "")))
      polRows(t, S, { date: pd.date, tasks: pd.tasks }, rerender)
      t.reload()
    }
    rr()
    return t
  }

  /* 英语 8 周日程的行：点标题＝看这节在新东方哪（弹路径 / 播放），
     勾选只认行尾「○ / ✓」，右侧「▶ 课」同样是看课件 */
  function enRows(t, S, ed, rerender, compact) {
    ed.tasks.forEach(task => {
      const k = enTid(ed.date, task)
      const on = !!S.done[k]
      /* compact：主界面一行——英语 · 时长 · 程度；📍三级定位和 note 收进 ⓘ */
      const sb = on
        ? "英语 · " + task.dur + " · 完成于 " + (fmtStamp(S.done[k]) || "—")
        : "英语 · " + task.dur + " · " + task.level
          + (compact ? "" :
            (task.loc ? " · 📍" + task.loc : "")   // 新东方三级定位：阶段›小版块›第几课时
            + (task.note ? " · " + task.note : ""))
      const r = mrow(
        task.title,
        cut(sb, compact ? 34 : 38),
        on ? TC.ok : TC.en, compact ? 46 : 58, compact ? undefined : 2
      )
      r.dismissOnSelect = false
      /* 点标题 = 看这节课在哪（弹路径 / 播放），不动完成状态 */
      r.onSelect = () => {
        if (!task.url) {
          return taskSheet(task, on, () => toggleDone(S, k, "en", rerender), null, null, S.done[k])
        }
        /* 已完成：点标题先看「完成了什么 + 什么时候」，播放放弹窗按钮里；
           未完成：照旧一点就去上课（这才是当下要做的动作） */
        if (on) {
          return taskSheet(task, on, () => toggleDone(S, k, "en", rerender),
            "▶ 打开这节课", () => openEnLink(task), S.done[k])
        }
        return openEnLink(task)
      }
      if (task.url) {
        const b = r.addButton("▶")
        try { b.width = 36 } catch (e) {}
        b.titleColor = TC.link
        b.onTap = () => openEnLink(task)
      }
      const dbe = r.addButton("ⓘ")
      dbe.titleColor = TC.link
      try { dbe.width = 26 } catch (e) {}
      dbe.onTap = () => taskSheet(task, on, () => toggleDone(S, k, "en", rerender),
        task.url ? "▶ 打开这节课" : null,
        task.url ? () => openEnLink(task) : null, S.done[k])
      markBtn(r, on, () => toggleDone(S, k, "en", rerender))
      t.addRow(r)
    })
  }

  function enDayTable(S, ed) {
    const t = new UITable()
    t.showSeparators = false
    const render = () => {
      t.removeAllRows()
      const done = ed.tasks.filter(x => S.done[enTid(ed.date, x)]).length
      t.addRow(head("英语 · " + ed.date.slice(5).replace("-", "/") + " " + ed.wd,
        done + "/" + ed.tasks.length + " 已完成 · " + ed.min + " 分钟"))
      enRows(t, S, ed, render)
      t.reload()
    }
    render()
    return t
  }

  /* 「✓ 已完成 N 条」一行（2026-10-28）
     以前主界面只列未完成，勾完就消失，最后只剩一句「今天打完了 ✓」——
     用户想回看「到底完成了什么」根本点不进去。
     现在：折叠/展开一行，展开后就地列出这些条目（每条仍可点开看详情：科目、
     时长、章节、完成时间、视频链接，也能取消勾选）。 */
  /* 英语 / 政治的「已完成」：默认收起，一行「✓ 已完成 N 条」+ 展开按钮。
     （药学三科已经改成「点科目进独立页」，不再走这里） */
  function doneBlock(t, S, dn, state, render, rowsFn, openAll) {
    const open = !!state.on
    const r = mrow((open ? "▾ " : "▸ ") + "✓ 已完成 " + dn.length + " 条",
      open ? "点「收起」" : "点「展开」看完成了哪些", TC.ok, 44)
    r.dismissOnSelect = false
    const tg = () => { state.touched = true; state.on = !state.on; render() }
    r.onSelect = tg
    const b = r.addButton(open ? "收起" : "展开")
    b.titleColor = TC.link
    b.onTap = tg
    t.addRow(r)
    if (!open) return
    rowsFn(dn)
  }

  const UI_VER = "1107-diag"      /* 改了小满界面就往上写，方便确认手机上跑的是哪版 */

  function mainTable(P, S) {
    const iso = todayISO()
    const d = dayOf(P, iso)
    const t = new UITable()
    t.showSeparators = false
    let showDays = false      /* 全部日程默认收起，首屏只留今天 */
    let polMore = false       /* 政治超过 2 条时才展开 */
    /* 已完成块的展开状态：全部做完的那一科自动展开一次，之后听用户的 */
    const doneMore = { pharm: { on: false, touched: false },
                       en: { on: false, touched: false },
                       pol: { on: false, touched: false } }

    const render = () => {
      t.removeAllRows()
      const es = enStatOf(iso, S)
      const pdd = polToday(iso)
      const dDone = d ? d.tasks.filter(x => S.done[tid(x)]).length : 0
      const pDone = pdd ? pdd.tasks.filter(x => S.done[tid(x)]).length : 0
      const todayDone = dDone + (es ? es.done : 0) + pDone
      const todayAll = (d ? d.tasks.length : 0) + (es ? es.n : 0) + (pdd ? pdd.tasks.length : 0)

      /* 顶部一行把「第几天 + 今日总量」说完，不再单独占一整块 */
      t.addRow(head((d ? "第 " + d.day + " 天 · " : "") + iso.slice(5).replace("-", "/") + " " + ((d && d.wd) || ""),
        "今日 " + todayDone + "/" + todayAll + " 项 · v" + UI_VER))
      coachBlock(t, iso)

      /* ---------- 药学（有机/药理/分析 都是药学下面的小单位，不单独列行） ----------
         用户 2026-10-28：科目不要单独占一行，还是像以前一样混在药学下面；
         主界面只列**还没做的**，做完就消失、后面的顶上来；全做完就写「药学今天已完成」。
         想只看某一科 → 进「打开当天完整清单」，那里每科有个可点的标题。 */
      if (d) {
        const un = d.tasks.filter(x => !S.done[tid(x)])
        const by = d.by && Object.keys(d.by).length
          ? Object.keys(d.by).map(k => (SUB[k] ? SUB[k].name : k) + " " + d.by[k]).join(" · ")
          : ""
        const openDay = async () => {
          await dayTable(P, S, d).present(true)
          kick("day")
          render()
        }
        t.addRow(head("药学 " + dDone + "/" + d.tasks.length + " · " + d.min + " 分钟", by, openDay, "全部"))
        if (un.length) {
          taskRows(t, P, S, { date: d.date, tasks: un.slice(0, 2) }, render, true)
          if (un.length > 2) {
            const r = mrow("还有 " + (un.length - 2) + " 条", "", TC.link, 40)
            r.dismissOnSelect = false
            r.onSelect = openDay
            const rb = r.addButton("打开")
            rb.titleColor = TC.link
            rb.onTap = openDay
            t.addRow(r)
          }
        } else {
          const r = mrow("药学今天已完成 ✓", "共 " + d.tasks.length + " 条 · 点开看每一条的详情", TC.ok, 46)
          r.dismissOnSelect = false
          r.onSelect = openDay
          const rb = r.addButton("打开")
          rb.titleColor = TC.link
          rb.onTap = openDay
          t.addRow(r)
        }
      }

      /* ---------- 英语 ---------- */
      if (es) {
        const unE = es.ed.tasks.filter(x => !S.done[enTid(es.ed.date, x)])
        const openEnDay = async () => {
          await enDayTable(S, es.ed).present(true)
          kick("enday")
          render()
        }
        t.addRow(head("英语 " + es.done + "/" + es.n + " · " + es.ed.min + " 分钟",
          es.today ? "今日" : es.ed.date.slice(5).replace("-", "/") + " " + es.ed.wd, openEnDay, "全部"))
        if (unE.length) {
          enRows(t, S, { date: es.ed.date, tasks: unE.slice(0, 2) }, render, true)
          if (unE.length > 2) {
            const r = mrow("还有 " + (unE.length - 2) + " 条", "", TC.link, 40)
            r.dismissOnSelect = false
            r.onSelect = async () => {
              await enDayTable(S, es.ed).present(true)
              kick("enday")
              render()
            }
            t.addRow(r)
          }
        }
        const dnE = es.ed.tasks.filter(x => S.done[enTid(es.ed.date, x)])
        if (dnE.length) {
          if (!unE.length && !doneMore.en.touched) doneMore.en.on = true
          doneBlock(t, S, dnE, doneMore.en, render,
            list => enRows(t, S, { date: es.ed.date, tasks: list }, render, true),
            { day: es.ed.day, fn: async () => {
              await enDayTable(S, es.ed).present(true)
              kick("enday")
              render()
            } })
        }
      }

      /* ---------- 英语加餐：昨日复盘 + 今日完形（2026-11-01 合并一行）----------
         两件事都不是「今天必须做的任务」，不该各占一行。一行两个按钮：
         「复盘」= 题型分布 + 错题 + 视频；「完形」= 跳记录本网页做三空。 */
      if (RV || (CD && CD.items && CD.items.length)) {
        const wn = RV && RV.totals ? (RV.totals.wrong || 0) : 0
        const seen = RV ? rvSeenGet() === RV.date : true
        const weak = RV && RV.push && RV.push[0] ? RV.push[0] : null
        const row = mrow(
          (RV ? (seen ? "" : "● ") + "复盘 " + String(RV.date).slice(5).replace("-", "/") + " 错 " + wn : "复盘")
            + (CD ? " ｜ 完形三空 " + CD.items.length + " 空" : ""),
          cut((weak ? "最弱 " + weak.cn : "昨日全对，保持") + (CD ? " · 完形去记录本网页" : ""), 34),
          seen ? TC.dim : (wn ? TC.pol : TC.en), 46)
        row.dismissOnSelect = false
        if (RV) {
          const openRv = async () => { await rvTable(RV).present(true); render() }
          row.onSelect = openRv
          const rb = row.addButton("复盘")
          rb.titleColor = TC.link
          rb.onTap = openRv
        }
        if (CD && CD.items && CD.items.length) {
          const openCz = () => Safari.open("https://1123user.github.io/en-journal/journal.html")
          if (!RV) row.onSelect = openCz
          const cb = row.addButton("完形")
          cb.titleColor = TC.link
          cb.onTap = openCz
        }
        t.addRow(row)
      }

      /* ---------- 政治 ---------- */
      if (pdd) {
        const unP = pdd.tasks.filter(x => !S.done[tid(x)])
        const openPolDay = async () => {
          await polDayTable(S, pdd, render).present(true)
          kick("polday")
          render()
        }
        t.addRow(head("政治 " + pDone + "/" + pdd.tasks.length + " · " + pdd.min + " 分钟",
          pdd.date.slice(5).replace("-", "/") + " " + pdd.wd + (pdd.focus ? " · 第 " + pdd.day + " 天" : ""), openPolDay, "全部"))
        if (unP.length) {
          polRows(t, S, { date: pdd.date, tasks: unP.slice(0, polMore ? 99 : 2) }, render, true)
          if (unP.length > 2) {
            const r = mrow(polMore ? "收起" : "还有 " + (unP.length - 2) + " 条",
              cut(pdd.focus || "", 30), TC.link, 40)
            r.dismissOnSelect = false
            r.onSelect = () => { polMore = !polMore; render() }
            t.addRow(r)
          }
        }
        const dnP = pdd.tasks.filter(x => S.done[tid(x)])
        if (dnP.length) {
          if (!unP.length && !doneMore.pol.touched) doneMore.pol.on = true
          doneBlock(t, S, dnP, doneMore.pol, render,
            list => polRows(t, S, { date: pdd.date, tasks: list }, render, true))
        }
      }

      /* ---------- 底部：设置 + 全量日程（2026-11-01）----------
         播放方式 / 去开屏 / 登录都是「配一次就不用管」的东西，
         原来各占一行天天挂着，主界面越拉越长。现在收进一行「⚙ 设置」弹窗。 */
      /* 跨端同步状态：白天勾的攒在这里，夜里一次推；也能手动立刻推 */
      if (syncMode() !== "off") {
        const waitPush = !!SYNC_ST.pendAt
        const nDone = Object.keys(S.done || {}).length
        const sySub = waitPush
          ? "点此立即推给二轮复习"
          : "勾完停手即推 · 二轮复习即时可见"
        const sy = mrow(waitPush ? "⏳ 待同步 · 共 " + nDone + " 条勾选" : "☁ 跨端同步 · 已是最新",
          sySub, TC.link, 42)
        sy.dismissOnSelect = false
        const doNow = () => { syncToApp(S, true); render() }
        sy.onSelect = doNow
        const syb = sy.addButton(waitPush ? "同步" : "设置")
        syb.titleColor = TC.link
        syb.onTap = waitPush ? doNow : (() => { syncModeSheet(render) })
        t.addRow(sy)
      }
      const st = mrow("⚙ 设置", "播放方式 · 去开屏 · 登录新东方", TC.link, 40)
      st.dismissOnSelect = false
      const openSettings = async () => {
        const a = new Alert()
        a.title = "设置"
        a.message = "B站播放方式当前是「" + playLabel() + "」\n跨端同步当前是「" + syncLabel() + "」"
        a.addAction("切换播放方式")
        a.addAction("跨端同步方式 · " + syncLabel())
        a.addAction("立即拉取云端数据（安排/推荐/知识库）")
        a.addAction("去开屏 / 去广告" + (detectProxies().length ? " · 一键安装" : " · 看做法"))
        a.addAction("登录新东方")
        a.addAction("🩺 启动监测 · 最近 " + DIAG.length + " 步")
        a.addCancel("关闭")
        const i = await a.presentAlert()
        if (i === 5) diagSheet()
        else if (i === 0) playModeSheet(render)
        else if (i === 1) syncModeSheet(render)
        else if (i === 2) {
          await Promise.all([pullTomorrowCloud(true), pullRecCloud(true), pullKbCloud(true),
            pullPlanCloud(true), pullPolCloud(true)]).catch(() => {})
          saveSyncSt({ lastPull: dayStr(), lastPullAt: Date.now() })
          render()
        }
        else if (i === 3) noSplashSheet()
        else if (i === 4) openKoolearnLogin()
      }
      st.onSelect = openSettings
      const stb = st.addButton("打开")
      stb.titleColor = TC.link
      stb.onTap = openSettings
      t.addRow(st)

      const dr = mrow(showDays ? "▾ 全部日程" : "▸ 全部日程",
        "药学 " + P.days.length + " 天" + (EN ? " · 英语 " + EN.days.length + " 天" : "") + " · 点开查看", TC.link, 46)
      dr.dismissOnSelect = false
      const toggleDays = () => { showDays = !showDays; render() }
      dr.onSelect = toggleDays
      const drb = dr.addButton(showDays ? "收起" : "展开")
      drb.titleColor = TC.link
      drb.onTap = toggleDays
      t.addRow(dr)

      if (showDays) {
        P.days.forEach(day => {
          const done = day.tasks.filter(x => S.done[tid(x)]).length
          const mark = day.date === iso ? "▸ " : ""
          const r = mrow(mark + "D" + day.day + "  " + day.date.slice(5).replace("-", "/") + " " + day.wd,
            done + "/" + day.tasks.length + " · " + day.min + " 分钟" + (day.date === iso ? " · 今天" : ""))
          r.dismissOnSelect = false
          r.onSelect = async () => {
            await dayTable(P, S, day).present(true)
            kick("day")
            render()
          }
          t.addRow(r)
        })
        if (EN) {
          EN.days.forEach(day => {
            const dn = day.tasks.filter(x => S.done[enTid(day.date, x)]).length
            const mark = day.date === iso ? "▸ " : ""
            const r = mrow(mark + "E" + day.day + "  " + day.date.slice(5).replace("-", "/") + " " + day.wd,
              dn + "/" + day.tasks.length + " · " + day.min + " 分钟" + (day.date === iso ? " · 今天" : ""))
            r.dismissOnSelect = false
            r.onSelect = async () => {
              await enDayTable(S, day).present(true)
              kick("enday")
              render()
            }
            t.addRow(r)
          })
        }
      }
      t.reload()
    }
    RERENDER = render
    render()
    return t
  }
  
  /* ---------- 入口 ---------- */
  trace("start")
  /* v53 启动兜底：任何一步抛错都不能「静默只剩代码界面」——
     弹窗把错误摆出来 + 写进 run-log，并提示跑「更新小满」自愈。 */
  try {
  const T0 = Date.now()
  var BOOT_STEP = "刚进入口"          /* v54：分步探针，启动出错时弹窗报「卡在哪一步」 */
  try { loadPlayMode() } catch (e) {}   /* v59：播放偏好读挂也不许影响启动 */
  /* 启动提速（2026-11-01）：原来六个 await 一个接一个排着，iCloud 下载 + JSON 解析全串成一条线；
     现在能并行的都并行。组件只用到 P/S/EN/POL，复盘和完形是 App 清单里的块，组件不读。 */
  const inWidget = !!config.runsInWidget
  BOOT_STEP = "从 Mac 同步数据"
  try {
    /* 组件里只做极轻量的进度同步（一个小请求）；排期/立绘全量同步只在 App 内做 ——
       Widget 执行预算很小，拉几百 KB 会超时，表现就是"组件一直空白/打不开" */
    if (inWidget) {
      const r = new Request(LAN + "/api/done")
      r.timeoutInterval = 4
      const d = await r.loadJSON()
      if (d && d.done) fm.writeString(F_PROG, JSON.stringify({ done: d.done, dels: d.dels || {} }))
    } else {
      await prefetchLAN(false)
    }
  } catch (e) {}
  BOOT_STEP = "并行读数据（进度/排期/英语/政治）"
  /* v59：iCloud 原生异常是**同步逃逸**的（不等 Promise），直接在调用点炸出来——
     所以每个加载器都套同步安全壳：谁抽风谁变 null，绝不拖死整个脚本。
     进度读挂时由下面的 Gist 云端兜底恢复。 */
  /* v67：每个加载器各自计时入监测（谁慢、谁抛，一眼看到） */
  const safe = (name, f) => {
    const t = Date.now()
    try {
      return Promise.resolve(f()).then(r => { diag(name, t); return r },
        e => { diag(name, t, e); return null })
    } catch (e) { diag(name + "（同步抛错）", t, e); return Promise.resolve(null) }
  }
  const jobs = [safe("读进度", loadProg), safe("读排期", loadPlan), safe("读英语", loadEn), safe("读政治", loadPol)]
  if (!inWidget) jobs.push(safe("读复盘", loadRv), safe("读完形", loadCd))
  const R = await Promise.all(jobs.map(p => p.catch(e => { diag("await 兜底", 0, e); return null })))
  let S = R[0]
  if (!S || !S.done) {
    /* v58：手机 iCloud 容器抽风（原生层报错）时，进度从 Gist 云端兜底恢复，
       勾选通道完全不经过 iCloud —— 这台手机的 iCloud 已经不可靠了 */
    try {
      const cd = await gistCloud()
      S = { done: (cd && cd.done) || {}, _fromCloud: true }
      if (cd && cd.dels) {
        for (const k in cd.dels) if ((cd.done || {})[k] === undefined && S.done[k] !== undefined) delete S.done[k]
      }
    } catch (e) { S = { done: {} } }
  }
  const P = R[1]
  EN = R[2]
  POL = R[3]
  if (!inWidget) { RV = R[4]; CD = R[5] }
  const T_LOAD = Date.now()
  /* 手机端心跳：手动运行脚本时推一次，电脑端据此判断「手机跑过、能连上 GitHub」 */
  if (!inWidget) {
    /* v67 真凶：Timer.schedule 的回调写成 async 函数时，Scriptable 的 Swift 桥接会把它
       按「repeats: Bool」那个重载去解析，同步抛
         Expected value of type boolean but got value of type {any: any}
       这一行没有任何 try，于是整个启动炸掉 —— 表现就是「一点开只弹一个报错、界面出不来」。
       改法：回调用**普通函数**，异步活在里面自己起 IIFE；外面再包一层 try 兜底。 */
    BOOT_STEP = "安排心跳定时器"
    const tHB = Date.now()
    try {
      Timer.schedule(0.9, () => {
        diag("心跳定时器触发", tHB)
        ;(async () => {
          try { if (gistConf()) { await pushGist(S, true); diag("心跳推送完成") } } catch (e) { diag("心跳推送失败", 0, e) }
        })()
      })
      diag("心跳定时器已安排", tHB)
    } catch (e) { diag("心跳定时器抛错（已忽略，不影响启动）", tHB, e) }
  }

  if (config.runsInWidget) {
    /* v47 补丁：数据过期时组件也补拉一次。之前拉取只挂在 App 内打开那条路径，
       组件刷新永远 pull=0ms —— 用户白天看组件，看到的永远是夜里没拉成的旧数据。
       频率兜底：needPullNow 的 lastPull 记账（最多一次/天）+ 各 pull 内部 6h 节流。 */
    try {
      if (needPullNow()) {
        await Promise.all([pullTomorrowCloud(), pullKbCloud(), pullRecCloud(), pullPlanCloud(), pullPolCloud()])
        saveSyncSt({ lastPull: dayStr(), lastPullAt: Date.now() })
      }
    } catch (e) {}
    /* 组件里出错时不要糊一屏红色堆栈：兜成一行可读提示，并把错误写进 run-log.txt */
    BOOT_STEP = "构建小组件"
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
    bootLog(T0, T_LOAD, T_LOAD, Date.now(), "w")
    Script.setWidget(w)
    Script.complete()
  } else {
    BOOT_STEP = "首屏·首次提示"
    /* 只弹一次：第一次跑带播放偏好的版本时把「点 ▶ 会发生什么」说清楚 */
    try {
      const firstTime = !fm.fileExists(F_PLAY)
      if (firstTime) {
        const a = new Alert()
        a.title = "点 ▶ 现在直接进 B 站 App 的视频页"
        a.message = "用的是 bilibili://video/{BV} 深链，不再先落到首页推荐流，打开就是那一集。\n\n"
          + "开屏广告还在 —— 那是 App 自己画的启动图，脚本点不到「跳过」。"
          + "要连开屏也去掉，走首页底部「去开屏 / 去广告」：装一次代理规则（MITM），之后冷启动只剩默认启动图。\n\n"
          + "想改回网页播放：「B站播放方式」→ 切换。"
        a.addAction("知道了")
        await a.present()
        savePlayMode(PLAY_MODE)
      }
    } catch (e) {}
    if (!P) {
      const a = new Alert()
      a.title = "排期加载失败"
      a.message = "还没有本地缓存，也没有网络。请连上网后重新运行一次。"
      a.addAction("好")
      try { await a.present() } catch (e) {}
    } else {
      if (!PROG_OK) {
        const a = new Alert()
        a.title = "进度文件还没同步下来"
        a.message = "iCloud 里的 progress.json 这次没读下来。为避免覆盖旧数据，这次不写云端 —— "
          + "但你打的勾会先存在手机本地，下次运行自动并回去，不会丢。"
        a.addAction("知道了")
        try { await a.present() } catch (e) {}
      }
      /* 三个云端同步并行跑（原来串行：最坏要排 8+20+8 秒），
         而且 rec/tomorrow 都加了 6 小时节流 —— 日常打开基本不再出网。 */
      /* 夜里集中拉一轮（白天直接用 iCloud 缓存，零出网），详见「跨端同步节律」 */
      BOOT_STEP = "首屏·云端拉取"
      try {
        if (needPullNow()) {
          await Promise.all([pullTomorrowCloud(), pullKbCloud(), pullRecCloud(), pullPlanCloud(), pullPolCloud()])
          saveSyncSt({ lastPull: dayStr(), lastPullAt: Date.now() })
        }
      } catch (e) {}
      const T_PULL = Date.now()
      BOOT_STEP = "首屏·留痕"
      bootLog(T0, T_LOAD, T_PULL, Date.now(), "pre")   /* 到「清单即将弹出」为止，先记一笔 */
      /* 开机静默刷新（v51）：iCloud 手机→Mac 卡住时，新排期/新顺序到不了手机 ——
         主界面弹出 1.5s 后静默拉一次安排+政治（内部 6h 节流），拉到新版就地重画，
         不用等 22:00，也不用进设置手点；失败零打扰、绝不白屏。
         v55：Timer.schedule 这一个原生调用整段兜住 —— v54 实测它抛过
         「Expected boolean but got any」，把整个启动炸掉；定时器失败不该拦路。 */
      if (P) {
        BOOT_STEP = "首屏·安排开机刷新"
        try {
        Timer.schedule(1.5, () => {
          diag("开机静默刷新触发")
          ;(async () => {
            try {
              const got = await Promise.all([pullPlanCloud(), pullPolCloud()])
              let ch = false
              if (got[0]) { mergePlanInPlace(P, got[0]); ch = true }
              if (got[1]) { POL = got[1]; ch = true }
              if (ch && RERENDER) RERENDER()
              diag("开机静默刷新" + (ch ? "已更新" : "无变化"))
            } catch (e) { diag("开机静默刷新失败", 0, e) }
          })()
        })
        } catch (e) { diag("开机静默刷新定时器抛错（已忽略）", 0, e) }
      }
      BOOT_STEP = "渲染主清单"
      await mainTable(P, S).present(true)
      bootLog(T0, T_LOAD, T_PULL, Date.now(), "full")  /* 关掉清单后再补一笔 */
      kick("close", true)   // 关掉清单时强制补一次：被 1.5s 去抖吃掉的点按，靠这里兜底
      /* 关清单时补推：即时模式给「2.5 秒定时器没跑到」兜底；夜里则把白天攒的一次推掉。
         白天 + 夜间批量模式下这里是空转 —— 不再每次都弹「在小满中打开二轮复习」。 */
      try { if (needPushNow()) syncToApp(S) } catch (e) {}
    }
    Script.complete()
  }
  } catch (bootErr) {
    /* v53：启动异常兜底 —— 不白屏、不静默，直接告诉用户是什么错、怎么修。
       v54：带分步探针（卡在哪一步）+ message（原生错误往往只有 @[native code] 没堆栈） */
    try {
      const em = String((bootErr && bootErr.message) || bootErr || "")
      const st = String((bootErr && bootErr.stack) || "")
      const where = (typeof BOOT_STEP === "string" && BOOT_STEP) || "?"
      const msg = ("卡在：" + where + "\n"
        + (em && em !== "undefined" ? em + "\n" : "")
        + (st.indexOf("native code") >= 0 ? "（底层原生错误，无 JS 堆栈 —— 多半是 iCloud 容器这步抽风，重跑一次或重启手机后重试）" : st)).slice(0, 800)
      try {
        const lp = fm.joinPath(DIR, "run-log.txt")
        let old = ""
        try { if (fm.fileExists(lp)) old = fm.readString(lp) || "" } catch (e) {}
        fm.writeString(lp, new Date().toISOString().slice(5, 16).replace("T", " ") +
          "  " + BUILD + "  BOOT-ERR  " + msg.split("\n")[0] + "\n" + old)
      } catch (e) {}
      if (!config.runsInWidget) {
        const a = new Alert()
        a.title = "小满启动出错（" + BUILD + "）"
        const dg = DIAG.length ? "\n\n启动监测（从下往上看）：\n" + DIAG.slice(-14).join("\n") : ""
        a.message = (msg + dg + "\n\n处理：跑一次「更新小满」—— 它会从云端拉最新版并做完整性校验，能自动修掉损坏的脚本。").slice(0, 1500)
        a.addAction("好")
        await a.present()
      } else {
        const w = new ListWidget()
        const t = w.addText("小满启动出错\n点我重试，或跑一次「更新小满」")
        t.font = Font.systemFont(11)
        t.textColor = new Color("#FF453A")
        w.url = "scriptable:///run/" + encodeURIComponent(Script.name())
        Script.setWidget(w)
      }
    } catch (e2) {}
  }

})()
