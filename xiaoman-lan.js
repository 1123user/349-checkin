// 小满 · 局域网版（约 280 行 / 11KB）
// 排期 + 进度都从你 Mac 的 8878 服务读；勾选直接发回 Mac（同一 Wi-Fi 秒同步）
// 不需要 token、不走外网、不碰 iCloud；不在同一网络时用本机缓存，勾选先记本机、回来自动补推
(async () => {
  const LAN = "http://172.20.10.6:8878"
  const TOKEN = "xiaoman-349"

  const lf = FileManager.local()
  const CACHE = lf.joinPath(lf.documentsDirectory(), "xm3-cache.json")
  const PEND = lf.joinPath(lf.documentsDirectory(), "xm3-pending.json")

  const SUBN = { org: "有机", ana: "分析", pha: "药理", pol: "政治", en: "英语" }
  const SUBO = ["org", "ana", "pha", "pol", "en"]
  const TC = { org: "#FF453A", ana: "#0A84FF", pha: "#FF9F0A", pol: "#BF5AF2", en: "#30D158", ok: "#30D158", dim: "#8E8E93" }

  function rd(p, fb) { try { return JSON.parse(lf.readString(p)) || fb } catch (e) { return fb } }
  function wr(p, o) { try { lf.writeString(p, JSON.stringify(o)) } catch (e) {} }
  function isoToday() {
    const n = new Date()
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0")
  }
  function keyOf(t, iso) {
    if (t.sub === "en") return "en|" + (iso || isoToday()) + "|" + t.key
    return t.sub + "|" + t.key + "|" + (t.bvid || "")
  }

  async function getJSON(url, to) {
    const r = new Request(url)
    r.timeoutInterval = to || 6
    return await r.loadJSON()
  }
  async function postSync(done, del) {
    const r = new Request(LAN + "/api/sync")
    r.method = "POST"
    r.headers = { "Content-Type": "application/json" }
    r.body = JSON.stringify({ token: TOKEN, done: done || {}, del: del || {} })
    r.timeoutInterval = 6
    const t = await r.loadString()
    if (t && t.indexOf('"ok":true') < 0) throw new Error("Mac 返回异常")
  }

  async function flushPending() {
    const p = rd(PEND, { done: {}, del: {} })
    const nd = p.done || {}, nl = p.del || {}
    if (!Object.keys(nd).length && !Object.keys(nl).length) return true
    try {
      await postSync(nd, nl)
      wr(PEND, { done: {}, del: {} })
      return true
    } catch (e) { return false }
  }
  function addPending(k, stamp, isDel) {
    const p = rd(PEND, { done: {}, del: {} })
    p.done = p.done || {}; p.del = p.del || {}
    if (isDel) { p.del[k] = stamp; delete p.done[k] }
    else { p.done[k] = stamp; delete p.del[k] }
    wr(PEND, p)
  }

  async function loadAll(quick) {
    const c = rd(CACHE, {})
    const data = {
      plan: c.plan || null, en: c.en || null, pol: c.pol || null,
      done: c.done || {}, dels: c.dels || {}
    }
    const hasToday = data.plan && (data.plan.days || []).some(d => d.date === isoToday())
    if (!quick || !hasToday) {
      try {
        const [p, e, q] = await Promise.all([
          getJSON(LAN + "/plan3.json", 8).catch(() => null),
          getJSON(LAN + "/plan-en.json", 8).catch(() => null),
          getJSON(LAN + "/plan-pol.json", 8).catch(() => null)
        ])
        if (p && p.days) data.plan = p
        if (e && e.days) data.en = e
        if (q && q.days) data.pol = q
      } catch (err) {}
    }
    try {
      const d = await getJSON(LAN + "/api/done", 5)
      if (d && d.done) { data.done = d.done; data.dels = d.dels || {} }
    } catch (err) {}
    wr(CACHE, data)
    return data
  }

  function tasksOf(data) {
    const iso = isoToday()
    const out = []
    const d3 = (data.plan && (data.plan.days || []).find(x => x.date === iso)) || null
    if (d3) for (const t of d3.tasks || []) out.push(t)
    const dp = (data.pol && (data.pol.days || []).find(x => x.date === iso)) || null
    if (dp) for (const t of dp.tasks || []) out.push(t)
    const de = (data.en && (data.en.days || []).find(x => x.date === iso)) || null
    if (de) for (const t of de.tasks || []) out.push(t)
    return out
  }
  function kickWidget() { try { Widget.reloadAll() } catch (e) {} }

  function ringImage(ratio, size, color) {
    const ctx = new DrawContext()
    ctx.size = new Size(size, size)
    ctx.opaque = false
    const c = size / 2, r = c - 5
    ctx.setStrokeColor(new Color("#3A3A3C"))
    ctx.setLineWidth(5)
    const p0 = new Path()
    p0.addEllipse(new Rect(5, 5, size - 10, size - 10))
    ctx.addPath(p0)
    ctx.strokePath()
    if (ratio > 0.001) {
      ctx.setStrokeColor(new Color(color))
      ctx.setLineWidth(5)
      const p = new Path()
      p.addArc(new Point(c, c), r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(ratio, 1), false)
      ctx.addPath(p)
      ctx.strokePath()
    }
    return ctx.getImage()
  }

  function addRow(w, t, isDone) {
    const st = w.addStack()
    st.layoutHorizontally(); st.centerAlignContent(); st.spacing = 4
    const tag = st.addText(SUBN[t.sub] || t.sub)
    tag.font = Font.boldSystemFont(9)
    tag.textColor = new Color("#8E8E93")
    const dot = st.addText(isDone ? "✓" : "○")
    dot.font = Font.systemFont(10)
    dot.textColor = new Color(isDone ? "#30D158" : "#8E8E93")
    const tx = st.addText(t.title)
    tx.font = Font.systemFont(10)
    tx.lineLimit = 1
    tx.minimumScaleFactor = 0.7
    tx.textColor = new Color(isDone ? "#5A5A5E" : "#E5E5EA")
    st.addSpacer()
    if (t.dur) {
      const d = st.addText(t.dur)
      d.font = Font.systemFont(8.5)
      d.textColor = new Color("#636366")
    }
  }

  function build(data, family) {
    const w = new ListWidget()
    w.backgroundColor = new Color("#0A0A0C")
    w.url = "scriptable:///run/" + encodeURIComponent(Script.name())
    w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000)

    const tasks = tasksOf(data)
    const done = data.done || {}
    const fin = tasks.filter(t => done[keyOf(t)]).length
    const total = tasks.length
    const ratio = total ? fin / total : 0
    const color = ratio >= 1 ? "#30D158" : "#FF9F0A"

    if (family === "small") {
      w.setPadding(12, 12, 12, 12)
      const top = w.addStack(); top.layoutHorizontally(); top.centerAlignContent()
      const img = top.addImage(ringImage(ratio, 46, color))
      img.imageSize = new Size(46, 46)
      top.addSpacer()
      const right = top.addStack(); right.layoutVertically()
      const n1 = right.addText(String(fin)); n1.font = Font.boldSystemFont(20); n1.textColor = new Color(color)
      const n2 = right.addText("共 " + total); n2.font = Font.systemFont(10); n2.textColor = new Color("#8E8E93")
      w.addSpacer()
      const t = w.addText(total === 0 ? "无排期" : (total - fin > 0 ? "还剩 " + (total - fin) + " 条" : "今天完成 ✓"))
      t.font = Font.systemFont(10); t.textColor = new Color("#8E8E93")
      return w
    }

    w.setPadding(10, 12, 10, 12)
    const hd = w.addStack(); hd.layoutHorizontally(); hd.centerAlignContent()
    const ttl = hd.addText("小满")
    ttl.font = Font.boldSystemFont(12); ttl.textColor = new Color("#FFFFFF")
    hd.addSpacer()
    const cnt = hd.addText(fin + "/" + total)
    cnt.font = Font.boldSystemFont(12); cnt.textColor = new Color(color)
    w.addSpacer(5)

    if (total === 0) {
      const t = w.addText("今天没有排期数据")
      t.font = Font.systemFont(11); t.textColor = new Color("#8E8E93")
      return w
    }

    const maxRows = family === "large" ? 11 : 5
    const order = []
    for (const s of SUBO) for (const t of tasks) if (t.sub === s && !done[keyOf(t)]) order.push(t)
    for (const s of SUBO) for (const t of tasks) if (t.sub === s && done[keyOf(t)]) order.push(t)

    const shown = order.slice(0, maxRows)
    for (let i = 0; i < shown.length; i++) {
      addRow(w, shown[i], !!done[keyOf(shown[i])])
      if (i < shown.length - 1) w.addSpacer(3)
    }
    if (order.length > maxRows) {
      w.addSpacer(3)
      const more = w.addText("还有 " + (order.length - maxRows) + " 条，点开看全部")
      more.font = Font.systemFont(9); more.textColor = new Color("#636366")
    }
    return w
  }

  async function check(title, msg) {
    const a = new Alert(); a.title = title; a.message = msg || ""; a.addAction("好")
    await a.presentAlert()
  }

  async function appUI() {
    await flushPending()
    let data
    try { data = await loadAll(false) } catch (e) { await check("连不上 Mac", String(e.message || e)); return }
    const tasks = tasksOf(data)
    if (!tasks.length) {
      await check("今天没排期", "Mac 上 plan3 / plan-pol / plan-en 里都没有 " + isoToday() + "\n\n（确认手机和 Mac 在同一 Wi-Fi）")
      return
    }
    const done = data.done || {}, dels = data.dels || {}
    const tbl = new UITable()

    async function toggle(t) {
      const k = keyOf(t)
      const on = !!done[k]
      const stamp = Date.now()
      if (on) { delete done[k]; dels[k] = stamp } else { done[k] = stamp; if (dels[k]) delete dels[k] }
      buildRows(); tbl.reload()
      try {
        await postSync(on ? {} : { [k]: stamp }, on ? { [k]: stamp } : {})
        wr(CACHE, data); kickWidget()
      } catch (e) {
        if (on) { done[k] = stamp; delete dels[k] } else { delete done[k] }
        addPending(k, stamp, on)
        buildRows(); tbl.reload()
        await check("没连上 Mac，已记在本机", "手机和 Mac 在同一 Wi-Fi 时，下次运行会自动补推。\n\n" + String(e.message || e))
      }
    }

    async function taskSheet(t) {
      const on = !!done[keyOf(t)]
      const a = new Alert()
      a.title = t.title
      const meta = []
      meta.push((SUBN[t.sub] || t.sub) + (t.dur ? " · " + t.dur : "") + (t.level ? " · " + t.level : ""))
      if (t.group) meta.push("章节：" + t.group)
      if (t.note) meta.push(t.note)
      a.message = meta.join("\n")
      const acts = []
      acts.push({ label: on ? "取消勾选" : "标记完成", run: () => { toggle(t) } })
      if (t.bvid) acts.push({ label: "▶ 在 B 站打开", run: () => { try { Safari.open("bilibili://video/" + t.bvid) } catch (e) {} } })
      if (t.url) acts.push({ label: "🌐 网页打开", run: () => { try { Safari.open(t.url) } catch (e) {} } })
      acts.forEach(x => a.addAction(x.label))
      a.addCancelAction("返回")
      const i = await a.present()
      if (i >= 0 && i < acts.length) acts[i].run()
    }

    function buildRows() {
      tbl.removeAllRows()
      const finN = tasks.filter(t => done[keyOf(t)]).length
      const h = new UITableRow()
      h.isHeader = true
      h.height = 54
      const hc = h.addText("今日 " + finN + "/" + tasks.length,
        (tasks.length - finN > 0 ? "还剩 " + (tasks.length - finN) + " 条" : "全部完成 ✓") + " · 点行看详情，右侧圆圈打勾")
      hc.titleFont = Font.boldSystemFont(17)
      hc.subtitleFont = Font.systemFont(10.5)
      hc.subtitleColor = new Color(TC.dim)
      tbl.addRow(h)

      for (const sub of SUBO) {
        const g = tasks.filter(t => t.sub === sub)
        if (!g.length) continue
        const f = g.filter(t => done[keyOf(t)]).length
        const hd = new UITableRow()
        hd.isHeader = true
        hd.height = 30
        const hx = hd.addText((SUBN[sub] || sub) + "   " + f + "/" + g.length)
        hx.titleFont = Font.boldSystemFont(12)
        hx.titleColor = new Color(TC[sub] || TC.dim)
        tbl.addRow(hd)

        const sorted = g.slice().sort((x, y) => (done[keyOf(x)] ? 1 : 0) - (done[keyOf(y)] ? 1 : 0))
        for (const t of sorted) {
          const on = !!done[keyOf(t)]
          const r = new UITableRow()
          r.height = 50
          const c = r.addText(t.title, (t.dur || "") + (t.level ? " · " + t.level : "") + (on ? " · 已完成" : ""))
          c.titleFont = Font.semiboldSystemFont(13.5)
          c.subtitleFont = Font.systemFont(10)
          c.lineLimit = 1
          c.titleColor = new Color(on ? TC.ok : (TC[sub] || "#E5E5EA"))
          c.subtitleColor = new Color(TC.dim)
          r.dismissOnSelect = false
          r.onSelect = () => { taskSheet(t) }
          const btn = r.addButton(on ? "✓" : "○")
          btn.width = 44
          btn.titleColor = new Color(on ? TC.ok : TC.dim)
          btn.onTap = () => { toggle(t) }
          tbl.addRow(r)
        }
      }
    }

    buildRows()
    await tbl.present()
  }

  if (config.runsInWidget) {
    const data = await loadAll(true)
    const w = build(data, config.widgetFamily || "medium")
    Script.setWidget(w)
  } else {
    await appUI()
  }
  Script.complete()
})()
