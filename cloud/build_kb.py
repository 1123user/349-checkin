#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 ai-tutor 的训练语料榨成 kb.json（小满看得懂的知识卡）

  ai-tutor/data/train.jsonl
    ├── kind=point  47 条考点串讲 → 抽出每条「要点」，成为知识卡
    └── kind=card  891 条知识卡   → 只留答案（知识陈述本身）
          ↓
  kb.json（按科目 + 关键词索引，纯知识，不含题干和答案字母）

  只抽「要点」部分：题干、选项、答案字母一律不落地 —— 这样公开到 Pages
  也不泄露真题，但复习时最该看的那句话留下了。

  用法：python3 cloud/build_kb.py --src ../二轮复习移动学习App/ai-tutor/data/train.jsonl
"""
import argparse
import json
import os
import re
import sys

# 考点名 → 关键词（用来和题库的系统名对上，如「紫外可见」）
KW_EXTRA = {
    "紫外-可见分光光度法": ["紫外", "可见", "吸收光谱", "朗伯", "比尔", "λmax"],
    "红外吸收光谱法": ["红外", "IR", "特征峰", "羰基峰"],
    "核磁共振波谱法": ["核磁", "NMR", "氢谱", "碳谱", "化学位移"],
    "质谱法": ["质谱", "MS", "分子离子", "碎片"],
    "荧光分析法": ["荧光", "磷光"],
    "色谱理论与气相/液相色谱": ["色谱", "气相", "液相", "HPLC", "GC", "塔板", "保留"],
    "平面色谱法": ["薄层", "TLC", "纸色谱", "平面色谱"],
    "电位法与永停滴定": ["电位", "永停", "pH", "电极"],
    "滴定分析（酸碱/氧化还原/配位/沉淀）": ["滴定", "酸碱", "氧化还原", "配位", "沉淀"],
    "误差与数据处理": ["误差", "有效数字", "偏差", "t检验"],
    "电子效应（诱导/共轭/超共轭）": ["诱导", "共轭", "超共轭", "电子效应"],
    "芳烃与亲电取代": ["芳烃", "苯", "亲电取代", "定位"],
    "卤代烃（取代与消除）": ["卤代烃", "取代", "消除", "SN1", "SN2"],
    "烯烃与炔烃（加成/氧化）": ["烯烃", "炔烃", "加成", "马氏", "氧化"],
    "羧酸衍生物": ["羧酸", "酰卤", "酸酐", "酯", "酰胺", "水解"],
    "立体化学与优势构象": ["立体", "构象", "手性", "R/S", "ee"],
    "鉴别与分离": ["鉴别", "分离", "区分"],
    "反应机理与结构物性": ["机理", "碳正", "碳负", "自由基"],
    "反应条件与试剂": ["条件", "试剂", "催化"],
    "命名": ["命名", "IUPAC"],
    "综合推断与合成": ["推断", "合成", "路线"],
    "抗菌药物·β-内酰胺类": ["β-内酰胺", "青霉素", "头孢", "化学治疗", "化疗药"],
    "抗菌药物·大环内酯与氨基糖苷": ["大环内酯", "氨基糖苷", "红霉素", "庆大", "化学治疗", "化疗药"],
    "抗菌药物·喹诺酮与磺胺": ["喹诺酮", "磺胺", "氟喹诺酮", "化学治疗", "化疗药"],
    "抗结核与抗真菌抗病毒药": ["抗结核", "异烟肼", "抗真菌", "抗病毒", "化学治疗", "化疗药"],
    "肾上腺皮质激素": ["糖皮质激素", "肾上腺", "皮质激素"],
    "胰岛素与口服降糖药": ["胰岛素", "降糖", "二甲双胍", "磺酰脲"],
    "甲状腺激素与抗甲状腺药": ["甲状腺", "硫脲"],
    "解热镇痛抗炎药": ["解热", "镇痛", "抗炎", "NSAIDs", "阿司匹林"],
    "心血管系统药理（含心衰/心律/心绞痛/利尿/调脂）": ["心血管", "心衰", "心律", "心绞痛", "利尿", "调脂", "地高辛"],
    "抗高血压药": ["高血压", "ACEI", "钙拮抗", "普利", "地平"],
    "传出神经系统药理": ["胆碱", "肾上腺素", "M受体", "N受体", "传出"],
    "中枢神经系统药理": ["中枢", "镇静", "催眠", "抗癫痫", "抗精神病"],
    "药效学基础": ["药效", "受体", "量效", "激动", "拮抗"],
    "药物代谢动力学": ["药动", "半衰期", "生物利用度", "首过", "清除"],
    "化学治疗药": ["化疗", "抗菌", "抗生素"],
    "血液·呼吸·消化系统药": ["血液", "呼吸", "消化", "平喘", "抑酸"],
}

STOP = re.compile(r"^(本题考查|该题考查|考查|本题)")


def kw_of(name):
    """考点名 → 匹配关键词"""
    base = re.sub(r"[（(].*?[)）]", "", name).strip()
    out = list(KW_EXTRA.get(name, []))
    for part in re.split(r"[·、/与和]", base):
        p = part.strip()
        if len(p) >= 2 and p not in out:
            out.append(p)
    return [x for x in dict.fromkeys(out) if len(x) >= 2]


ANSWER_TAIL = re.compile(
    r"[，,。；;]?\s*(?:故\s*)?(?:本\s*)?(?:题\s*)?"
    r"(?:正确项为|答案为|故答案为|答案|选)\s*[A-E][、，,A-E]*\s*(?:正确|不符|错误|为|项)?.*$")
# 「。A、B仅为…，D、E不符」这种选项对比，从 A、B 处一刀砍掉
OPTION_TAIL = re.compile(r"[。；;]\s*[A-E]\s*[、，,][^。]{0,80}$")


def points_of(body):
    """从考点串讲里挖出「要点」句子（扔掉题干和答案字母）"""
    tips = []
    for seg in re.split(r"要点[：:]", body)[1:]:
        seg = re.split(r"例\s*\d|^\s*【|答案[：:]", seg)[0]
        seg = re.sub(r"\s+", " ", seg)
        seg = ANSWER_TAIL.sub("", seg)          # 砍掉「故选D」「正确项为C」这类尾巴
        seg = OPTION_TAIL.sub("", seg)          # 砍掉「。A、B仅为…，D、E不符」
        seg = STOP.sub("", seg).strip(" 。；;，,")
        if 12 <= len(seg) <= 160:
            tips.append(seg)
    if not tips:  # 没有「要点」标记的，退化成正文首句
        s = re.sub(r"\s+", " ", body)
        s = re.split(r"例\s*\d", s)[0]
        s = s.replace("下面用真题把这个考点串起来：", "").strip()
        s = re.sub(r"^【.*?】", "", s).strip(" 。；;，,")
        if 12 <= len(s) <= 200:
            tips.append(s)
    # 去重
    seen, out = set(), []
    for t in tips:
        k = t[:24]
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out[:5]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.expanduser(
        "~/CodeBuddy/二轮复习移动学习App/ai-tutor/data/train.jsonl"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "kb.json"))
    a = ap.parse_args()

    if not os.path.exists(a.src):
        sys.exit("✗ 找不到训练语料：%s" % a.src)

    rows = []
    with open(a.src, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                pass

    points = []
    for r in rows:
        if r.get("kind") != "point":
            continue
        q = (r["messages"][1].get("content") or "") if len(r["messages"]) > 1 else ""
        body = (r["messages"][2].get("content") or "") if len(r["messages"]) > 2 else ""
        m = re.search(r"考点「(.+?)」", q)
        if not m or not body:
            continue
        name = m.group(1)
        if "未细分考点" in name:
            continue
        tips = points_of(body)
        if not tips:
            continue
        points.append({"sub": r.get("sub"), "name": name,
                       "kw": kw_of(name), "tips": tips})

    cards = []
    for r in rows:
        if r.get("kind") != "card":
            continue
        q = (r["messages"][1].get("content") or "").strip()
        ans = (r["messages"][2].get("content") or "").strip()
        ans = re.sub(r"\s+", " ", ans)
        if not (40 <= len(ans) <= 400):
            continue
        if "需对照原题" in ans or "见图" in ans:
            continue
        cards.append({"sub": r.get("sub"), "q": re.sub(r"\s+", " ", q)[:60], "a": ans[:280]})

    doc = {"built": __import__("time").strftime("%Y-%m-%d %H:%M"),
           "src": "ai-tutor", "points": points, "cards": cards}

    out = os.path.abspath(a.out)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    kb = os.path.getsize(out) / 1024
    print("→ %s  %.0f KB" % (out, kb))
    print("  考点 %d 个 / 知识卡 %d 条" % (len(points), len(cards)))
    for p in points[:4]:
        print("   [%s] %s → %d 条要点" % (p["sub"], p["name"], len(p["tips"])))
        print("       ", p["tips"][0][:70])


if __name__ == "__main__":
    main()
