#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云端推荐 —— 电脑不开机也能算出「明天看什么」

  跑在 GitHub Actions 里，输入全在云端：
    /tmp/er-sync.json         私有仓库的作答记录（fetch_progress.py 拉下来的）
    data/sysmap.json          题目 → 系统
    data/video_index.json     系统 → 视频
    data/rec_hist.json        防重推历史（跑完写回，随仓库提交）

  输出 rec.json 提交进本仓库 → 小满从 Pages 直接拉，不依赖 iCloud、
  也不依赖 Mac 是否开机（2026-11-01）

  算法与 tools/recommend.py 保持一致：Elo 能力估计 + FSRS 遗忘曲线 → 缺口排序，
  先保三科各一条，再按缺口补满，同一支片 3 天内不重推。
"""
import argparse
import datetime
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_IN = os.environ.get("ER_SNAP", "/tmp/er-sync.json")
SYSMAP = os.path.join(ROOT, "data", "sysmap.json")
VIDX = os.path.join(ROOT, "data", "video_index.json")
HIST = os.path.join(ROOT, "data", "rec_hist.json")
OUT = os.path.join(ROOT, "rec.json")

BUDGET_MIN = 110
MAX_ITEMS = 5
RECENT_DAYS = 3
SUBN = {"pharm": "药理", "org": "有机", "ana": "分析"}
SUBFIX = {"organic": "org", "analytical": "ana"}


def load(p, d=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return d


def norm_ts(t):
    """秒 / 毫秒 / 微秒 统一成秒"""
    try:
        t = float(t)
    except Exception:
        return 0.0
    if t > 1e14:
        t /= 1e6
    elif t > 1e11:
        t /= 1e3
    return t


def elo_theta(recs):
    """按作答顺序滚 Elo：难的题赢得多，能力涨得快"""
    th, K = 1200.0, 32.0
    for _, ok in recs:
        exp = 1.0 / (1.0 + 10 ** ((1450.0 - th) / 400.0))
        th += K * ((1.0 if ok else 0.0) - exp)
    return th


def snap_from_cloud(prog):
    """云端 progress {qid:{ok,ts}} → 推荐脚本认的 snap 结构"""
    items, last = {}, 0
    for qid, v in (prog or {}).items():
        if not isinstance(v, dict):
            continue
        ts = norm_ts(v.get("ts"))
        items[qid] = {"ok": 1 if v.get("ok") else 0, "t": ts}
        last = max(last, ts)
    return {"items": items, "n": len(items),
            "built": datetime.datetime.fromtimestamp(last).strftime("%Y-%m-%d %H:%M:%S") if last else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    raw = load(SNAP_IN)
    if not raw:
        sys.exit("✗ 读不到云端作答 %s（workflow 里先跑 fetch_progress.py）" % SNAP_IN)
    sysmap, vidx = load(SYSMAP), load(VIDX)
    if not (sysmap and vidx):
        sys.exit("✗ 缺 data/sysmap.json 或 data/video_index.json")

    snap = snap_from_cloud(raw.get("progress") or raw)
    q2sys = sysmap["map"]
    sub_of_sys = {}
    for sub, arr in sysmap["sysOfSub"].items():
        for s in arr:
            sub_of_sys.setdefault(s, sub)

    now = datetime.datetime.now()
    now_ts = now.timestamp()

    agg = {}
    for qid, v in snap["items"].items():
        s = q2sys.get(qid)
        if not s:
            continue
        sub = sub_of_sys.get(s)
        sub = SUBFIX.get(sub, sub)
        if sub not in ("pharm", "org", "ana"):
            continue
        d = agg.setdefault((sub, s), {"n": 0, "ok": 0, "recs": [], "last": 0})
        d["n"] += 1
        d["ok"] += 1 if v.get("ok") else 0
        ts = v.get("t") or 0
        d["recs"].append((ts, 1 if v.get("ok") else 0))
        d["last"] = max(d["last"], ts)

    sub_total = {}
    for (sub, s), d in agg.items():
        sub_total[sub] = sub_total.get(sub, 0) + d["n"]

    table = []
    for (sub, s), d in agg.items():
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
        theta_norm = 1.0 / (1.0 + math.exp(-(th - 1200.0) / 200.0))
        mastery = max(0.0, min(1.0, 0.45 * acc_w + 0.55 * theta_norm))
        days = (now_ts - d["last"]) / 86400.0 if d["last"] else 99
        S = 2.0 + 12.0 * mastery
        R = 1.0 / (1.0 + max(0.0, days) / (9.0 * S))
        w = d["n"] / max(1, sub_total.get(sub, 1))
        gap = w * (1 - mastery) * (0.5 + 0.5 * (1 - R))
        if "其他" in s or "综合测试" in s:
            gap *= 0.4
        table.append({"sub": sub, "sys": s, "n": d["n"], "acc": round(acc, 3),
                      "acc7": round(ro / rn, 3) if rn else None,
                      "mastery": round(mastery, 3), "R": round(R, 3),
                      "days": round(days, 1), "theta": round(th), "w": round(w, 4),
                      "gap": round(gap, 5)})
    table.sort(key=lambda x: -x["gap"])

    hist = load(HIST, {}) or {}
    recent = {k: v for k, v in hist.items() if (now_ts - v) / 86400.0 <= RECENT_DAYS}
    by_sys = {}
    for v in vidx["videos"]:
        for s in v["sys"]:
            by_sys.setdefault((v["sub"], s), []).append(v)

    def best_video(row):
        pool_all = by_sys.get((row["sub"], row["sys"]), [])
        cands = [v for v in pool_all if (v["bvid"] + "|" + (v["title"] or "")) not in recent]
        if not cands:
            cands = list(pool_all)
        if not cands:
            return None
        weak = row["mastery"] < 0.55
        for floor in ((1200, 600, 0) if weak else (0,)):
            pool = [v for v in cands if v["sec"] >= floor]
            if not pool:
                continue

            def sc_of(v):
                mins = max(3.0, v["sec"] / 60.0)
                lvl = 1.15 if v["level"] == "必看" else 1.0
                src = 1.0 if v["src"] == "main" else 0.9
                shape = math.sqrt(mins / 20.0) if weak else (1.0 / math.sqrt(mins))
                if v["sec"] > 5400:
                    shape *= 0.55
                return row["gap"] * lvl * src * shape

            return max(pool, key=sc_of)
        return None

    order, seen_sys = [], set()
    for sub in ("pharm", "org", "ana"):
        r = next((x for x in table if x["sub"] == sub and x["gap"] > 0
                  and x["sys"] not in seen_sys), None)
        if r:
            order.append(r)
            seen_sys.add(r["sys"])
    for r in table:
        if len(order) >= MAX_ITEMS:
            break
        if r["sys"] in seen_sys or r["gap"] <= 0:
            continue
        order.append(r)
        seen_sys.add(r["sys"])

    picked = []
    for row in order:
        v = best_video(row)
        if not v:
            continue
        picked.append({
            "sub": row["sub"], "sub_cn": SUBN.get(row["sub"], row["sub"]),
            "sys": row["sys"], "title": v["title"], "bvid": v["bvid"],
            "page": v["page"], "min": round(v["sec"] / 60), "url": v["url"],
            "level": v["level"], "src": v["src"],
            "mastery": row["mastery"], "acc": row["acc"], "R": row["R"],
            "days": row["days"], "n": row["n"], "gap": round(row["gap"], 4),
            "why": "%s 掌握 %d%%%s · 占本科题量 %d%%" % (
                row["sys"], round(row["mastery"] * 100),
                ("（近7天 %d%%）" % round(row["acc7"] * 100)) if row.get("acc7") is not None else "",
                round(row["w"] * 100)),
        })
        if len(picked) >= 3 and sum(p["min"] for p in picked) >= BUDGET_MIN:
            break

    doc = {"built": now.strftime("%Y-%m-%d %H:%M:%S"),
           "date": now.strftime("%Y-%m-%d"),
           "src": "cloud",
           "snap_built": snap.get("built"), "snap_n": snap.get("n"),
           "budget_min": BUDGET_MIN,
           "items": picked,
           "weak": [{"sub": t["sub"], "sub_cn": SUBN.get(t["sub"], t["sub"]), "sys": t["sys"],
                     "mastery": t["mastery"], "acc": t["acc"], "R": t["R"],
                     "days": t["days"], "n": t["n"], "gap": t["gap"]} for t in table[:8]],
           "cover": {"videos": len(vidx["videos"]), "systems": len(table)},
           "note": "云端算的（GitHub Actions）：Elo 能力 + FSRS 遗忘曲线，同一支片 3 天内不重推"}

    print("快照 %s（%s 条）→ 推荐 %d 条 / %d min" % (
        snap.get("built"), snap.get("n"), len(picked), sum(p["min"] for p in picked)))
    for p in picked:
        print("  [%s] %s ｜ %s ｜ %d min" % (p["sub_cn"], p["sys"], (p["title"] or "")[:30], p["min"]))

    if a.dry:
        print("\n（--dry，未写文件）")
        return

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("→ %s" % OUT)

    hist.update({p["bvid"] + "|" + (p["title"] or ""): now_ts for p in picked})
    hist = {k: v for k, v in hist.items() if (now_ts - v) / 86400.0 <= 7}
    with open(HIST, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
