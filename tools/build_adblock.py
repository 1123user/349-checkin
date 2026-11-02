#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拼一份「去开屏 / 去广告」Stash 覆写（adblock/ads.stoverride）

三段拼起来：
  ① 通用去广告：blackmatrix7/ios_rule_script 的 rewrite/Stash/Advertising（740 条 reject
     + 698 个 MITM 主机），负责大部分 App 的广告位、横幅、信息流；
  ② 开屏专用：淘宝（guide-acs 的 mtop.taobao.wireless.home.splash.awesome.get，只让
     广告素材与时长失效，不动推荐 / 搜索 / 订单）＋ B 站（app.bilibili.com 的
     splash/list）。
  ③ 银行 / 支付域名剔除：这些主机上了 MITM 只会增加「证书钉死 → App 打不开」的风险，
     对开屏收益为零，直接不给它 MITM。

两份开屏脚本都以 payload 内联进文件，装的时候不依赖 raw.githubusercontent——
国内直连 GitHub raw 经常超时，那会让 Stash 装到一半失败。

用法：
  python3 tools/build_adblock.py            # 联网拉上游，重新拼
  python3 tools/build_adblock.py --offline  # 用本地缓存重拼（不联网）
退出码：0 成功 ｜ 3 离线（且没有缓存）
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "adblock", "ads.stoverride")
CACHE = os.path.join(ROOT, "adblock", "upstream.Advertising.stoverride")
TAOBAO = os.path.join(ROOT, "adblock", "templates", "taobao-splash.stoverride")
BILI_JS = os.path.join(ROOT, "bili", "bili-splash.js")

UPSTREAM = ("https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/"
            "rewrite/Stash/Advertising/Advertising.stoverride")

BANK = ["icbc", "ccb.com", "boc.cn", "abchina", "cmbchina", "cmbc", "spdb", "bankcomm",
        "psbc", "ecitic", "citic", "pingan", "webank", "alipay", "tenpay", "unionpay",
        "95588", "95533", "95566"]

HEADER = """# 去开屏 / 去广告（全 App）· 小满版
# ① 通用规则：blackmatrix7/ios_rule_script → rewrite/Stash/Advertising（上游 %s）
# ② 开屏规则：淘宝（guide-acs·splash.awesome.get，保守版，不改推荐/订单）
#              B 站（app.bilibili.com/x/v2/splash/list）
# ③ 已剔除 %d 个银行 / 支付 MITM 主机，免得证书钉死把银行 App 弄打不开
# 重建：python3 tools/build_adblock.py ｜ 关闭：Stash → 覆写 → 取消启用
"""


def strip_console(js):
    """删掉 console.log(...) 调用：Stash 的日志在本机，但「严格零收集」连本机留痕也不留。
    按括号配对删整条调用，替换成 void 0 保证语法。"""
    out, i = [], 0
    while True:
        j = js.find("console.log", i)
        if j < 0:
            out.append(js[i:])
            break
        out.append(js[i:j])
        k = js.find("(", j)
        if k < 0:
            out.append(js[j:])
            break
        depth, m = 0, k
        while m < len(js):
            if js[m] == "(":
                depth += 1
            elif js[m] == ")":
                depth -= 1
                if depth == 0:
                    break
            m += 1
        out.append("void 0")
        i = m + 1
    return "".join(out)


def net_ok():
    g = os.path.expanduser("~/.codebuddy/bin/net-guard.sh")
    return (not os.path.exists(g)) or subprocess.call([g, "check", "-q"]) == 0


def load_yaml(path):
    import yaml
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch(offline):
    if os.path.exists(CACHE) and offline:
        return open(CACHE, encoding="utf-8").read()
    if not net_ok():
        if os.path.exists(CACHE):
            print("离线 → 用本地缓存", file=sys.stderr)
            return open(CACHE, encoding="utf-8").read()
        raise SystemExit(3)
    req = urllib.request.Request(UPSTREAM, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("utf-8")
    open(CACHE, "w", encoding="utf-8").write(txt)
    return txt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()

    import yaml

    txt = fetch(a.offline)
    open(CACHE, "w", encoding="utf-8").write(txt)
    base = yaml.safe_load(txt)
    # 先记下上游原样有没有脚本（后面会往 http 里加我们自己的两段，别记混）
    up_has_script = bool((base.get("http") or {}).get("script")) or bool(base.get("script-providers"))
    http = base.setdefault("http", {})
    rew = list(http.get("rewrite") or [])
    mitm = list(http.get("mitm") or [])
    n_rew, n_mitm = len(rew), len(mitm)

    keep_rew = [r for r in rew if not any(k in str(r).lower() for k in BANK)]
    keep_mitm = [h for h in mitm if not any(k in str(h).lower() for k in BANK)]
    dropped = (n_rew - len(keep_rew)) + (n_mitm - len(keep_mitm))
    # Stash 不认 surge 的 force-http-engine（2026-11-02 装机报「下载配置失败」时排查到的可疑项），
    # 它只对 6 个 HTTP-only 主机生效，删掉不影响开屏，先求能装上
    http.pop("force-http-engine", None)

    tb = load_yaml(TAOBAO)
    tb_http = tb.get("http") or {}
    bili_js = open(BILI_JS, encoding="utf-8").read()

    script = list(http.get("script") or [])
    for s in tb_http.get("script") or []:
        script.append(s)
    script.append({
        "match": r"^https?:\/\/app\.bilibili\.com\/x\/v2\/splash\/list",
        "name": "local-bili-splash",
        "type": "response",
        "require-body": True,
        "max-size": 1048576,
        "timeout": 10,
    })

    providers = dict(base.get("script-providers") or {})
    # 淘宝那段原文件给了 url/path/payload 三份，这里只留 payload：
    # raw.githubusercontent 在国内经常超时，留着 url 反而会让 Stash 去拉一个拉不到的地址
    # 同时给 payload（内联，离线可用）和 url（自家 Pages）：不同 Stash 版本取哪个不一致，
    # 两个都给等于两条路都留着。url 只指向 1123user.github.io，零收集审计放行。
    for name, pv in (tb.get("script-providers") or {}).items():
        providers[name] = {
            "payload": strip_console(pv.get("payload", "")),
            "url": "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/adblock/taobao-splash.js",
            "interval": 86400,
        }
    providers["local-bili-splash"] = {
        "payload": strip_console(bili_js),
        "url": "https://cdn.jsdelivr.net/gh/1123user/349-checkin@main/bili/bili-splash.js",
        "interval": 86400,
    }

    for h in list(tb_http.get("mitm") or []):
        if h not in keep_mitm:
            keep_mitm.append(h)
    if "app.bilibili.com" not in keep_mitm:
        keep_mitm.append("app.bilibili.com")

    http["rewrite"] = keep_rew
    http["mitm"] = keep_mitm
    http["script"] = script
    out = {"name": "去开屏 / 去广告（小满）",
           "desc": "通用去广告 + 淘宝/B站开屏；银行支付域名已排除 MITM",
           "http": http,
           "script-providers": providers}

    body = yaml.safe_dump(out, allow_unicode=True, sort_keys=False,
                          default_flow_style=False, width=10 ** 6)
    stamp = base.get("desc", "").replace("最后更新时间", "").strip() or "未知"
    text = (HEADER % (stamp, dropped)) + body
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(text)

    # 自检：重新解析，确认规则一条没丢、脚本都在
    chk = yaml.safe_load(open(OUT, encoding="utf-8"))
    h2 = chk["http"]
    assert [str(x) for x in h2["rewrite"]] == [str(x) for x in keep_rew], "rewrite 不一致"
    assert len(h2["script"]) == len(script)
    assert set(chk["script-providers"]) >= {"local-bili-splash"}

    # 硬指标①：上游只许给静态规则，不许带脚本（带了就说明有我们没审过的代码）
    if up_has_script:
        raise SystemExit("上游 Advertising 里出现了 script —— 拒绝拼装，先人工审计")

    # 硬指标②：零收集审计（联网上报 / 落盘留痕 / 远端脚本源 / 非 reject 规则）
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import audit_no_collect as audit
    bad, _warn = audit.audit_override(OUT)
    if bad:
        for p, ln, why, snip in bad[:10]:
            print("  ✗ %s:%s %s" % (p, ln, why), file=sys.stderr)
        raise SystemExit("零收集审计未通过 → 不落盘（文件已写，需先修脚本）")
    print("→ %s（%.1f KB）" % (OUT, os.path.getsize(OUT) / 1024))
    print("   rewrite %d 条 ｜ MITM %d 个 ｜ script %d 段"
          % (len(keep_rew), len(keep_mitm), len(script)))
    print("   上游 %s ｜ 剔除银行/支付相关 %d 项" % (stamp, dropped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
