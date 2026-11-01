#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""明天的日程 —— 主线不动，只按昨天的数据调「先补哪块」

  设计原则（用户 2026-11-01 提的）：
    ① 整体复习思路不变 → 明天的课程主线直接读 plan3.json，一个字不改
    ② 根据前一天的作答复盘 → 找出最弱系统，算配额
    ③ 合理推送第二天日程 → 主线 + 重点 + 看什么，合成 tomorrow.json
    ④ 电脑不开机也能跑 → 全部在 GitHub Actions 里算，结果提交到 Pages

  输入：
    /tmp/er-sync.json       云端作答记录（fetch_progress.py 拉下来）
    data/sysmap.json        题目 → 系统
    data/video_index.json   系统 → 视频
    plan3.json              复习主线（大纲，只读不改）
  输出：
    tomorrow.json           for_date 是明天，小满直接渲染
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recommend import (BUDGET_MIN, RECENT_DAYS, SUBN, SUBFIX, elo_theta,  # noqa: E402
                       load, norm_ts)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_IN = os.environ.get("ER_SNAP", "/tmp/er-sync.json")
SYSMAP = os.path.join(ROOT, "data", "sysmap.json")
VIDX = os.path.join(ROOT, "data", "video_index.json")
PLAN3 = os.path.join(ROOT, "plan3.json")
HIST = os.path.join(ROOT, "data", "rec_hist.json")
OUT = os.path.join(ROOT, "tomorrow.json")

CST = datetime.timezone(datetime.timedelta(hours=8))
YEST_W = 1.6          # 昨天的作答加权：昨天刚错的，今天最该补
TOTAL_QUOTA = 65      # 一天的刷题总量（三科合计）
KB = os.path.join(ROOT, "kb.json")   # 知识点（cloud/build_kb.py 从 ai-tutor 语料抽出）
# kb.json 里学科是全称（analytical/organic），题库这边用短名（ana/org）
ALIAS = {"analytical": "ana", "organic": "org", "pharm": "pharm"}
KB_MAP = os.path.join(ROOT, "data", "kb_sysmap.json")   # 系统名 -> 关联词


def _bg(s):
    s = re.sub(r"[\s\u00b7\uff08\uff09()\u3001\uff0c,/\u3010\u3011]", "", s or "")
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _load_kb():
    try:
        with open(KB, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"points": [], "cards": []}


def _load_kwmap():
    try:
        with open(KB_MAP, encoding="utf-8") as f:
            d = json.load(f)
        d.pop("_note", None)
        return d
    except Exception:
        return {}


_KB = _load_kb()
_KWMAP = _load_kwmap()


def sys_kw(sub, sysname):
    """系统名 -> 关联词（data/kb_sysmap.json，人工维护，解决字面对不上的问题）"""
    m = _KWMAP.get(sub) or {}
    if not m:                                  # 表里用的是全称（organic/analytical）
        rev = {v: k for k, v in ALIAS.items()}
        m = _KWMAP.get(rev.get(sub, sub)) or {}
    return [k for k in (m.get(sysname) or []) if len(k) >= 2]


def kb_match(sub, sysname):
    """系统名 -> 最相关的考点（关联词命中为主，字面相似兜底）"""
    kws = sys_kw(sub, sysname)
    a = _bg(sysname)
    best, bs = None, 0.0
    for p in _KB.get("points") or []:
        if ALIAS.get(p.get("sub"), p.get("sub")) != sub:   # 知识库用全称，题库用短名
            continue
        text = (p.get("name") or "") + " " + " ".join(p.get("tips") or [])
        sc = 0.0
        if kws:
            sc = sum(1 for k in kws if k in text) / float(len(kws))
        b = _bg(p.get("name"))
        if a and b:                                        # 字面相似兜底
            sc = max(sc, len(a & b) / float(len(a)))
        for k in p.get("kw") or []:
            if len(k) >= 2 and (k in (sysname or "") or (sysname or "") in k):
                sc = max(sc, 0.62)
        if sc > bs:
            best, bs = p, sc
    if not best or bs < 0.34:
        return None
    # 考点下有好几条要点，挑和这个系统最相关的那两条（不是无脑取前两条）
    kws2 = kws or [k for k in (best.get("kw") or []) if len(k) >= 2]
    scored = []
    for t in best.get("tips") or []:
        tb = _bg(t)
        sc = len(a & tb) / float(len(a)) if a else 0.0
        sc += 0.8 * sum(1 for k in kws2 if k in t)         # 命中关联词的排前面
        scored.append((sc, t))
    scored.sort(key=lambda x: -x[0])
    out = dict(best)
    # 只有确实沾边的要点才留（宁缺毋滥，别拿芳烃取代去凑「碳负离子」）
    keep = [t for sc, t in scored if sc >= 0.3]
    out["tips"] = keep[:2]
    return out


def card_match(sub, sysname):
    """系统名 -> 最相关的一条知识卡（card 是问答形态，比考点串讲更具体）"""
    kws = sys_kw(sub, sysname)
    if not kws:
        return None
    best, bs = None, 0
    for c in _KB.get("cards") or []:
        if ALIAS.get(c.get("sub"), c.get("sub")) != sub:
            continue
        text = (c.get("q") or "") + " " + (c.get("a") or "")
        hit = sum(1 for k in kws if k in text)
        if hit > bs:
            best, bs = c, hit
    return best if best and bs >= 1 else None


def day_range(d):
    a = datetime.datetime.combine(d, datetime.time(0, 0), CST)
    return a.timestamp(), a.timestamp() + 86400


def build_stats(items, q2sys, sub_of_sys):
    """按系统汇总，同时记住「今天 / 昨天」各做对多少"""
    now_ts = datetime.datetime.now(CST).timestamp()
    t0, t1 = day_range(datetime.datetime.now(CST).date())
    y0, y1 = t0 - 86400, t0
    agg = {}
    for qid, v in items.items():
        s = q2sys.get(qid)
        if not s:
            continue
        sub = SUBFIX.get(sub_of_sys.get(s), sub_of_sys.get(s))
        if sub not in ("pharm", "org", "ana"):
            continue
        ts = norm_ts(v.get("t"))
        d = agg.setdefault((sub, s), {"n": 0, "ok": 0, "recs": [], "last": 0,
                                      "yn": 0, "yok": 0, "tn": 0, "tok": 0})
        d["n"] += 1
        d["ok"] += 1 if v.get("ok") else 0
        d["recs"].append((ts, 1 if v.get("ok") else 0))
        d["last"] = max(d["last"], ts)
        if y0 <= ts < y1:
            d["yn"] += 1
            d["yok"] += 1 if v.get("ok") else 0
        elif t0 <= ts < t1:
            d["tn"] += 1
            d["tok"] += 1 if v.get("ok") else 0
    return agg, now_ts


def mastery_of(d, now_ts, sub_total, sub):
    d["recs"].sort()
    th = elo_theta(d["recs"])
    acc = d["ok"] / max(1, d["n"])
    cut = now_ts - 7 * 86400
    rn = ro = 0
    for ts, ok in d["recs"]:
        if ts >= cut:
            rn += 1
            ro += ok
    acc_w = (0.6 * (ro / rn) + 0.4 * acc) if rn else acc
    theta_norm = 1.0 / (1.0 + pow(2.718281828, -(th - 1200.0) / 200.0))
    mastery = max(0.0, min(1.0, 0.45 * acc_w + 0.55 * theta_norm))
    days = (now_ts - d["last"]) / 86400.0 if d["last"] else 99
    S = 2.0 + 12.0 * mastery
    R = 1.0 / (1.0 + max(0.0, days) / (9.0 * S))
    w = d["n"] / max(1, sub_total.get(sub, 1))
    gap = w * (1 - mastery) * (0.5 + 0.5 * (1 - R))
    return {"acc": acc, "mastery": mastery, "R": R, "days": days, "w": w, "gap": gap}


def main():
    raw = load(SNAP_IN)
    if not raw:
        sys.exit("✗ 读不到云端作答 %s" % SNAP_IN)
    sysmap, vidx, plan = load(SYSMAP), load(VIDX), load(PLAN3)
    if not (sysmap and vidx and plan):
        sys.exit("✗ 缺 sysmap / video_index / plan3.json")

    q2sys = sysmap["map"]
    sub_of_sys = {}
    for sub, arr in sysmap["sysOfSub"].items():
        for s in arr:
            sub_of_sys.setdefault(s, sub)

    items = {}
    for qid, v in (raw.get("progress") or {}).items():
        if isinstance(v, dict):
            items[qid] = {"ok": 1 if v.get("ok") else 0, "t": norm_ts(v.get("ts"))}

    now = datetime.datetime.now(CST)
    today = now.date()
    tomorrow = today + datetime.timedelta(days=1)
    agg, now_ts = build_stats(items, q2sys, sub_of_sys)

    sub_total = {}
    for (sub, s), d in agg.items():
        sub_total[sub] = sub_total.get(sub, 0) + d["n"]

    rows = []
    for (sub, s), d in agg.items():
        m = mastery_of(d, now_ts, sub_total, sub)
        rows.append(dict(sub=sub, sys=s, n=d["n"], yn=d["yn"], yok=d["yok"],
                         tn=d["tn"], tok=d["tok"], **m))
    # 缺口以「掌握得差」为主，题量只做轻微加权（否则题多的科永远排第一，
    # 会出现「掌握 73% 还被当成重点」这种反直觉结果）
    mw = max([r["w"] for r in rows], default=1) or 1
    for r in rows:
        r["gap"] = (1 - r["mastery"]) * (0.5 + 0.5 * (1 - r["R"])) * (0.6 + 0.4 * r["w"] / mw)
        if r["yn"] >= 3:                     # 昨天刚做错的，今天最该先补
            r["gap"] *= 1.0 + YEST_W * max(0.0, 0.85 - r["yok"] / r["yn"])
        if "其他" in r["sys"] or "综合测试" in r["sys"]:
            r["gap"] *= 0.4
    rows.sort(key=lambda x: -x["gap"])

    # ── 明天的重点：每科取缺口最大的系统（等价于「先补哪块」）──────────
    focus, seen = [], set()
    for sub in ("pharm", "org", "ana"):
        cand = [r for r in rows if r["sub"] == sub and r["sys"] not in seen]
        if not cand:
            continue
        r = cand[0]
        seen.add(r["sys"])
        focus.append(r)

    # 配额按缺口比例分 65 题（保底 12 题，太少没意义）
    gsum = sum(r["gap"] for r in focus) or 1
    for r in focus:
        q = max(12, round(TOTAL_QUOTA * r["gap"] / gsum))
        r["quota"] = q

    # ── 主线：plan3 明天的课程，原样搬过来（大纲不变）──────────────────
    day = next((x for x in plan.get("days") or [] if x.get("date") == tomorrow.isoformat()), None)
    main = []
    for t in (day or {}).get("tasks") or []:
        sub = {"pharm": "pharm", "org": "org", "ana": "ana"}.get(t.get("sub"), t.get("sub"))
        main.append({"sub": sub, "sub_cn": SUBN.get(sub, sub),
                     "title": t.get("title"), "from": "plan3"})

    # ── 看什么：每科一支片，和推荐脚本同一套挑法 ───────────────────────
    hist = load(HIST, {}) or {}
    recent = {k: v for k, v in hist.items() if (now_ts - v) / 86400.0 <= RECENT_DAYS}
    by_sys = {}
    for v in vidx["videos"]:
        for s in v["sys"]:
            by_sys.setdefault((v["sub"], s), []).append(v)

    rec = []
    for r in focus:
        pool_all = by_sys.get((r["sub"], r["sys"]), []) or \
            by_sys.get((r["sub"], r["sys"].replace("系统", "")), [])
        cands = [v for v in pool_all if (v["bvid"] + "|" + (v["title"] or "")) not in recent] or list(pool_all)
        if not cands:
            continue
        weak = r["mastery"] < 0.55
        floors = (1200, 600, 0) if weak else (0,)
        for fl in floors:
            pool = [v for v in cands if v["sec"] >= fl]
            if not pool:
                continue
            def sc(v):
                mins = max(3.0, v["sec"] / 60.0)
                shape = pow(mins / 20.0, 0.5) if weak else 1.0 / pow(mins, 0.5)
                if v["sec"] > 5400:
                    shape *= 0.55
                return r["gap"] * (1.15 if v["level"] == "必看" else 1.0) * shape
            best = max(pool, key=sc)
            rec.append({"sub": r["sub"], "sub_cn": SUBN.get(r["sub"], r["sub"]),
                        "sys": r["sys"], "title": best["title"], "bvid": best["bvid"],
                        "page": best["page"], "min": round(best["sec"] / 60), "url": best["url"]})
            break

    # ── 复盘：说清「昨天哪里没做好」────────────────────────────────────
    yrows = [r for r in rows if r["yn"]]
    y_n = sum(r["yn"] for r in yrows)
    y_ok = sum(r["yok"] for r in yrows)
    y_acc = (y_ok / y_n) if y_n else None
    weak3 = sorted(yrows, key=lambda x: (x["yok"] / x["yn"], -x["yn"]))[:3]
    weak3 = [w for w in weak3 if w["yn"] >= 3]

    if y_n:
        head = "昨天 %d 题，正确率 %d%%" % (y_n, round(y_acc * 100))
        if weak3:
            parts = []
            for w in weak3:
                parts.append("%s%d题只对%d" % (w["sys"], w["yn"], w["yok"]))
            detail = head + "，" + "、".join(parts) + "。"
        else:
            detail = head + "，没有明显塌方的地方。"
        if y_acc < 0.6 and weak3:
            tgt = next((f for f in focus if f["sub"] == weak3[0]["sub"]), None) or focus[0]
            detail += "今天先把%s的%s补上再往下走。" % (
                SUBN.get(tgt["sub"], tgt["sub"]), tgt["sys"])
    else:
        detail = "昨天没有作答记录，按原计划走。"

    acts = []
    for i, r in enumerate(focus):
        acts.append("%s 重点补 %s %d 题" % (SUBN.get(r["sub"], r["sub"]), r["sys"], r["quota"]))
    for v in rec[:2]:
        acts.append("看《%s》%d 分钟" % (v["title"][:16], v["min"]))

    # 每条重点配 2 条知识要点（来自 ai-tutor 药学助教的考点串讲）
    for r in focus:
        hit = kb_match(r["sub"], r["sys"])
        r["kb_name"] = hit["name"] if hit else ""
        r["tips"] = (hit["tips"] or [])[:2] if hit else []
        c = card_match(r["sub"], r["sys"])
        r["card"] = {"q": c.get("q", ""), "a": c.get("a", "")} if c else None

    doc = {
        "for_date": tomorrow.isoformat(),
        "built": now.strftime("%Y-%m-%d %H:%M:%S"),
        "src": "cloud",
        "yesterday": {"date": today.isoformat(), "n": y_n, "ok": y_ok,
                      "acc": round(y_acc, 3) if y_acc is not None else None,
                      "by_sub": [{"sub": r["sub"], "sub_cn": SUBN.get(r["sub"], r["sub"]),
                                  "n": r["yn"], "ok": r["yok"]}
                                 for r in sorted(yrows, key=lambda x: -x["yn"])]},
        "main": main,
        "focus": [{"sub": r["sub"], "sub_cn": SUBN.get(r["sub"], r["sub"]),
                   "sys": r["sys"], "quota": r["quota"],
                   "mastery": round(r["mastery"], 3), "acc": round(r["acc"], 3),
                   "n": r["n"], "yn": r["yn"], "yok": r["yok"],
                   "why": ("昨天 %d 题对 %d" % (r["yn"], r["yok"])) if r["yn"]
                          else ("掌握 %d%%" % round(r["mastery"] * 100)),
                   "kb_name": r["kb_name"], "tips": r["tips"], "card": r["card"]} for r in focus],
        "coach": {"text": "明天的重点", "detail": detail, "acts": acts},
        "rec": rec,
        "note": "主线来自复习计划（不动），重点/配额按前一天的作答算出来；"
                "由 GitHub Actions 每天自动生成，不依赖家里的电脑",
    }

    print("明天 %s" % doc["for_date"])
    print("  主线 %d 条（plan3）" % len(main))
    for r in focus:
        why = ("昨天 %d 题对 %d" % (r["yn"], r["yok"])) if r["yn"] else ("掌握 %d%%" % round(r["mastery"] * 100))
        print("  [%s] 重点 %s %d 题 ｜ %s" % (SUBN.get(r["sub"]), r["sys"], r["quota"], why))
    for v in rec:
        print("  ▶ %s ｜ %s ｜ %d min" % (v["sub_cn"], v["title"], v["min"]))
    print("  复盘：%s" % detail)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("→ %s" % OUT)

    hist.update({v["bvid"] + "|" + (v["title"] or ""): now_ts for v in rec})
    hist = {k: v for k, v in hist.items() if (now_ts - v) / 86400.0 <= 7}
    with open(HIST, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
