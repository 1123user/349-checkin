// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
/* 更新小满 · v2（2026-11-05 重写，取代旧的局域网版）
   ─────────────────────────────────────────────────────────────
   旧版从 http://172.20.10.6:8901/x.js 拉代码：服务器没开就直接崩，
   更危险的是没有任何完整性校验 —— 拉到半截/错误的文件也会直接覆盖
   「小满.js」，之后 Scriptable 解析不了，就只剩代码界面、小组件也打不开。

   本版口径（自愈型）：
   1) 只从 GitHub Pages 双源拉（Pages → jsDelivr 兜底），不走局域网；
   2) 四重校验才落笔：长度 > 50KB · 含 BUILD 标记 · 与清单版本一致 · 结尾是 })()；
   3) iCloud 与本机两处副本写同样内容（消除「两份小满不一致，小组件跑到旧的那份」）；
   4) 写后回读校验，失败自动用备份回滚；
   5) 小满.js 当前哪怕已经损坏也能用本脚本修复（不读旧内容做判断）。 */
const NAME = "小满.js"
const BASE = "https://1123user.github.io/349-checkin/"
const JSD = "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/"

async function get(url) {
  const r = new Request(url)
  r.timeoutInterval = 25
  r.headers = { "Cache-Control": "no-cache" }
  return await r.loadString()
}
function buildOf(code) {
  const m = String(code || "").match(/const BUILD = "([^"]+)"/)
  return m ? m[1] : ""
}
function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, "0")
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes())
}
async function say(title, msg) {
  const a = new Alert()
  a.title = title
  a.message = msg
  a.addAction("好")
  await a.presentAlert()
}

/* 目标清单：iCloud + 本机两处已有的小满.js 都覆盖；本机没有就不新建（避免莫名多一个） */
function targets() {
  const out = []
  const ic = FileManager.iCloud(), lo = FileManager.local()
  const p1 = ic.joinPath(ic.documentsDirectory(), NAME)
  if (ic.fileExists(p1)) out.push({ fm: ic, p: p1, kind: "iCloud" })
  const p2 = lo.joinPath(lo.documentsDirectory(), NAME)
  if (lo.fileExists(p2)) out.push({ fm: lo, p: p2, kind: "本机" })
  return out
}

async function main() {
  // 1) 清单：拿「最新文件名 + 期望版本」
  let meta = {}
  try { meta = JSON.parse(await get(BASE + "xiaoman-latest.json?t=" + Date.now())) } catch (e) {}
  const file = meta.file || "xiaoman-v47.js"
  const want = meta.build || ""

  // 2) 拉代码（Pages → jsDelivr 双源），四重校验
  let code = null, src = ""
  for (const u of [BASE + file, JSD + file]) {
    try {
      const c = await get(u + "?t=" + Date.now())
      if (c && c.length > 50000 && buildOf(c) && /\}\)\(\)\s*$/.test(c)
          && (!want || buildOf(c) === want)) { code = c; src = u; break }
    } catch (e) {}
  }
  if (!code) throw new Error("没拉到一份完整的小满代码（已双源尝试）。\n请确认手机能上网后重试。")
  const got = buildOf(code)

  const ts = targets()
  if (!ts.length) throw new Error("iCloud 与本机都没找到「" + NAME + "」，请确认脚本还在 Scriptable 里。")

  // 3) 已是最新 → 直接返回（逐个校验，有一处旧也算要更新）
  let allNew = true
  for (const t of ts) {
    let cur = ""
    try { cur = buildOf(t.fm.readString(t.p)) } catch (e) {}
    if (cur !== got) allNew = false
  }
  if (allNew) {
    await say("已是最新", "当前版本：" + got + "\n（界面版号：" + (meta.ui || "见清单顶部 v…") + "）")
    return
  }

  // 4) 逐处：备份 → 覆盖 → 回读校验（失败自动回滚这一处）
  const done = [], rolled = []
  for (const t of ts) {
    const bak = t.fm.joinPath(t.fm.documentsDirectory(), NAME + ".bak-" + stamp())
    let old = ""
    try { old = t.fm.readString(t.p) } catch (e) {}
    try {
      if (old && old.length > 1000) t.fm.writeString(bak, old)
      t.fm.writeString(t.p, code)
      const back = t.fm.readString(t.p)
      if (back !== code) throw new Error("回读不一致")
      if (buildOf(back) !== got) throw new Error("回读 BUILD 不符")
      done.push(t.kind)
    } catch (e) {
      try { if (old) t.fm.writeString(t.p, old) } catch (e2) {}
      rolled.push(t.kind + "：" + (e.message || String(e)))
    }
  }

  if (rolled.length) throw new Error("写入校验失败，已自动回滚：\n" + rolled.join("\n"))
  await say("更新完成",
    "→ " + got + "\n已写入：" + done.join(" + ") + " 两处\n\n"
    + "回 Scriptable 运行「小满」，清单顶部版本行应显示 v" + (meta.ui || "") + "。\n"
    + "若 Scriptable 列表里有两个「小满」（iCloud 与本机各一），请删掉本机那个，只留 iCloud 的 —— 两处同名会让小组件跑错副本。")
}

(async () => {
  try { await main() }
  catch (e) {
    await say("更新失败", String((e && e.message) || e) + "\n\n排查：1) 手机能上网吗 2) Safari 打开 "
      + BASE + "xiaoman-latest.json 看是否 404 3) 换「更新小满2」再试一次")
  }
})()
