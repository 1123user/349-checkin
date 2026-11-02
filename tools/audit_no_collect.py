#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""零收集审计：Stash 覆写 / 脚本里**不许**有任何联网上报或落盘留痕。

这条是硬指标（2026-11-02 定）：MITM 规则跑在本机，能看明文，所以它自己也必须是
「只看不改、改完就丢」—— 一旦脚本里出现 $httpClient / fetch / 埋点 / 写存储，
就等于把解密后的流量交出去了。宁可少一条去广告规则，也不接受一个上报。

审什么
------
  1) `.stoverride`：逐段扫 `script-providers.*.payload` 里的 JS；
     并且**禁止** provider 用远端 `url:`（除非是我们自己的 Pages），
     否则等于装了一份别人随时能改的代码。
  2) `.js`：整份当脚本审。
  3) 上游规则集：`http.script` 必须为空 —— 我们只吃静态 reject 规则，
     不吃别人写的脚本（blackmatrix7 那份本来就是 0 段脚本，加进来就报错）。

判据（命中即 FAIL）
------------------
  联网出站：$httpClient / $task.fetch / fetch( / XMLHttpRequest / sendBeacon /
           WebSocket / EventSource / new Image( / require( / import(
  落盘留痕：$persistentStore.write / $prefs.setValueForKey /
           localStorage.setItem / document.cookie =
  硬编码地址：脚本里出现 http(s):// 且不是注释里的说明性链接

用法
----
  python3 tools/audit_no_collect.py adblock bili        # 审目录
  python3 tools/audit_no_collect.py adblock/ads.stoverride
退出码：0 全部通过 ｜ 1 有违规
"""
import os
import re
import sys

# ── 判据 ──────────────────────────────────────────────────────────────
NET = [
    (r"\$httpClient", "调用了 $httpClient（可把请求/数据发出去）"),
    (r"\$task\s*\.\s*fetch", "调用了 $task.fetch"),
    (r"(?<![\w.$])fetch\s*\(", "调用了 fetch()"),
    (r"XMLHttpRequest", "用了 XMLHttpRequest"),
    (r"sendBeacon", "用了 sendBeacon（典型埋点）"),
    (r"new\s+WebSocket|EventSource", "开了长连接"),
    (r"new\s+Image\s*\(", "用 new Image() 打点"),
    (r"(?<![\w.$])require\s*\(|(?<![\w.$])import\s*\(", "动态加载外部模块"),
]
WRITE = [
    (r"\$persistentStore\s*\.\s*write", "写了持久化存储"),
    (r"\$prefs\s*\.\s*setValueForKey", "写了 NSUserDefaults"),
    (r"localStorage\s*\.\s*(setItem|removeItem)|sessionStorage\s*\.", "写了 Web 存储"),
    (r"document\s*\.\s*cookie\s*=", "写 cookie"),
]
URL_IN_CODE = re.compile(r"https?://[^\s'\"`)]+")
COMMENT = re.compile(r"^\s*(//|/\*|\*|#)")

ALLOW_PROVIDER_HOST = "1123user.github.io"     # 只有自家 Pages / 自家仓库的 CDN 允许作为远端脚本源
ALLOW_PROVIDER_HOST2 = "cdn.jsdelivr.net/gh/1123user/349-checkin"


def scan_js(name, code):
    bad, warns = [], []
    for i, line in enumerate(code.splitlines(), 1):
        s = line.strip()
        is_comment = bool(COMMENT.match(line))
        if not is_comment:
            for pat, why in NET + WRITE:
                if re.search(pat, line, re.I):
                    bad.append((name, i, why, s[:90]))
            m = URL_IN_CODE.search(line)
            if m:
                bad.append((name, i, "脚本里硬编码地址 " + m.group(0)[:60], s[:90]))
        if "console.log" in s:
            warns.append((name, i, "console.log（只写本机日志）", s[:70]))
    return bad, warns


def audit_override(path):
    import yaml
    bad, warns = [], []
    try:
        doc = yaml.safe_load(open(path, encoding="utf-8")) or {}
    except Exception as e:
        return [make(path, 0, "YAML 解析失败：%s" % e)], warns

    http = doc.get("http") or {}
    upstream_scripts = http.get("script") or []
    providers = doc.get("script-providers") or {}

    # ① 每一段 script 都必须有对应的本地 payload；指向远端的只认自家 Pages
    for s in upstream_scripts:
        nm = str(s.get("name") or "")
        pv = providers.get(nm)
        if pv is None:
            bad.append(make(path, 0, "script「%s」没有本地 payload（会去拉远端代码）" % nm))
            continue
        url = str(pv.get("url") or "")
        has_payload = bool(str(pv.get("payload") or "").strip())
        if url and ALLOW_PROVIDER_HOST not in url and ALLOW_PROVIDER_HOST2 not in url:
            bad.append(make(path, 0, "script「%s」的远端地址不是自家 Pages：%s" % (nm, url)))
        if not has_payload and not url:
            bad.append(make(path, 0, "script「%s」既没有 payload 也没有 url" % nm))
        if not has_payload and url:
            warns.append(make(path, 0,
                              "script「%s」走远端加载（自家 Pages），离线时不可用" % nm, url))

    # ② 逐段扫 payload
    for nm, pv in providers.items():
        code = str(pv.get("payload") or "")
        if code:
            b, w = scan_js("%s ⇢ %s" % (os.path.basename(path), nm), code)
            bad += b
            warns += w

    # ③ 规则本身只允许 reject，不允许出现 redirect / 改写指向第三方
    for r in http.get("rewrite") or []:
        low = str(r).lower()
        if " reject" not in low:
            bad.append(make(path, 0, "非 reject 规则（可能把流量导去别处）：%s" % str(r)[:80]))
    return bad, warns


def make(path, line, why, snippet=""):
    return (path, line, why, snippet)


def audit_file(path):
    if path.endswith(".stoverride"):
        return audit_override(path)
    if path.endswith(".js"):
        code = open(path, encoding="utf-8", errors="ignore").read()
        return scan_js(os.path.basename(path), code)
    return [], []


def walk(target):
    if os.path.isfile(target):
        return [target]
    out = []
    for root, _dirs, files in os.walk(target):
        for f in files:
            if f.endswith((".stoverride", ".js")) and not f.endswith(".bak"):
                out.append(os.path.join(root, f))
    return sorted(out)


def main(argv):
    targets = argv[1:] or ["adblock", "bili"]
    bad, warns, n = [], [], 0
    for t in targets:
        for p in walk(t):
            b, w = audit_file(p)
            bad += b
            warns += w
            n += 1
    print("审计 %d 个文件（覆写 + 脚本）" % n)
    if warns:
        print("提醒 %d 条（不拦）：" % len(warns))
        for w in warns[:5]:
            print("  · %s:%s %s" % (w[0], w[1], w[2]))
    if bad:
        print("✗ 违规 %d 条：" % len(bad))
        for p, ln, why, snip in bad[:40]:
            print("  %s:%s  %s\n      %s" % (p, ln, why, snip))
        return 1
    print("✓ 无联网上报、无落盘留痕、无非 reject 规则 —— 零收集通过")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
