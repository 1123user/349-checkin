// 小满 · 加载器（45 行 · 从 GitHub 仓库直链拉完整脚本）
// 直链不经过 Pages 构建，仓库一更新就能拿到；本机缓存兜底，断网也能跑上次的版本
(async () => {
  const BASES = [
    "https://raw.githubusercontent.com/1123user/349-checkin/main/",
    "https://1123user.github.io/349-checkin/"
  ]
  const lf = FileManager.local()
  const CACHE = lf.joinPath(lf.documentsDirectory(), "xiaoman-full.js")
  const readCache = () => { try { return lf.fileExists(CACHE) ? lf.readString(CACHE) : null } catch (e) { return null } }
  const writeCache = t => { try { lf.writeString(CACHE, t) } catch (e) {} }

  let meta = null, base = null
  for (const b of BASES) {
    try {
      const m = new Request(b + "xiaoman-latest.json?t=" + Date.now())
      m.timeoutInterval = 8
      const o = await m.loadJSON()
      if (o && o.file) { meta = o; base = b; break }
    } catch (e) {}
  }

  let code = null
  if (meta) {
    const c = readCache()
    if (c && meta.build && c.indexOf(meta.build) >= 0) code = c
    if (!code) {
      for (const b of [base].concat(BASES)) {
        try {
          const r = new Request(b + meta.file + "?t=" + Date.now())
          r.timeoutInterval = 25
          const t = await r.loadString()
          if (t && t.length > 50000 && (!meta.build || t.indexOf(meta.build) >= 0)) {
            code = t
            writeCache(t)
            break
          }
        } catch (e) {}
      }
    }
  }
  if (!code) code = readCache()

  if (!code) {
    const a = new Alert()
    a.title = "小满"
    a.message = "还没下载过完整脚本，请连一次网络再运行"
    a.addAction("好")
    await a.presentAlert()
    return
  }

  try {
    await eval(code)
  } catch (e) {
    if (!config.runsInWidget) {
      const a = new Alert()
      a.title = "完整脚本执行出错"
      a.message = String(e.message || e)
      a.addAction("好")
      await a.presentAlert()
    }
  }
})()
