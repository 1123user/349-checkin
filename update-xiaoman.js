/* 更新小满 · v1（bootstrap）
   ─────────────────────────────────────────────────────────────
   为什么需要它：Mac 上的新版「小满.js」卡在 iCloud 上传队列被系统节流，
   手机端永远拿到旧版。这个脚本绕开 iCloud，直接从 GitHub Pages 拉最新版，
   覆盖本机的「小满.js」，并把旧版存成 .bak-时间戳。

   用法：Scriptable → + → 粘贴本文件 → 命名「更新小满」→ 点运行。
   以后每次要更新，点这个名字跑一次就行（也可以从 update.html 的按钮直接拉起）。
   ───────────────────────────────────────────────────────────── */
const NAME = "小满.js"
const BASE = "https://1123user.github.io/349-checkin/"

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

async function main() {
  // 1) 先读清单，拿「最新文件名 + 版本」；清单挂了就退回约定名
  let meta = {}
  try {
    meta = JSON.parse(await get(BASE + "xiaoman-latest.json?t=" + Date.now()))
  } catch (e) { /* 清单不可用不致命 */ }

  const file = meta.file || "xiaoman-v47.js"
  const want = meta.build || ""

  // 2) 拉代码并做完整性校验（防止拉到半截或 404 页面）
  const code = await get(BASE + file + "?t=" + Date.now())
  if (!code || code.length < 50000) {
    throw new Error("拉到的内容不完整（" + (code ? code.length : 0) + " 字节）\n" + BASE + file)
  }
  const got = buildOf(code)
  if (!got) throw new Error("拉到的文件里没有 BUILD 标记，可能不是小满脚本")
  if (want && got !== want) throw new Error("版本不符：清单写 " + want + "，实际 " + got)

  // 3) 找到本机的小满.js（Scriptable 的 iCloud 文档目录就是脚本目录）
  const fm = FileManager.iCloud()
  const dir = fm.documentsDirectory()
  const path = fm.joinPath(dir, NAME)
  if (!fm.fileExists(path)) {
    throw new Error("在 Scriptable 目录里没找到「" + NAME + "」\n目录：" + dir + "\n如果脚本改过名，把本文件顶部的 NAME 改成实际名字。")
  }
  if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
    await fm.downloadFile(path)
  }

  const old = fm.readString(path)
  const oldBuild = buildOf(old)
  if (oldBuild === got) {
    await say("已是最新", "当前版本：" + got + "\n不用更新。\n\n（界面版号：" + (meta.ui || "见脚本 UI_VER") + "）")
    return
  }

  // 4) 备份旧版 → 覆盖
  fm.writeString(fm.joinPath(dir, NAME + ".bak-" + stamp()), old)
  fm.writeString(path, code)

  await say(
    "更新完成",
    (oldBuild || "旧版") + "  →  " + got + "\n\n" +
    "现在回 Scriptable 运行一次「小满」，顶部版本行应显示 " + (meta.ui || "") + "。\n" +
    "旧版已备份为 " + NAME + ".bak-" + stamp()
  )
}

main().catch(async e => {
  await say("更新失败", String((e && e.message) || e) + "\n\n" +
    "排查：1) 手机能上网吗 2) Safari 直接打开 " + BASE + "xiaoman-latest.json 看是否 404 3) 脚本名是否被改过")
})
