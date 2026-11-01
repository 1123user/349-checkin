#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把作答记录拉到 /tmp/er-sync.json

  GitHub Actions 里跑（电脑不开机也能跑）。两种模式，自动选：

    ① 有凭证  → 走 GitHub API 读私有仓库
        ER_TOKEN  私有数据仓库的 PAT（fine-grained，只需 Contents:Read）
        ER_OWNER  默认 1123user
        ER_REPO   默认 er-sync-
        ER_FILE   默认 er-sync.json

    ② 没凭证  → 走 raw.githubusercontent 匿名读（要求仓库是 public）
        —— 数据只有 qid + 对错 + 时间戳，没有题干，公开也不泄露题目

  本地手动跑：ER_TOKEN=xxx python3 cloud/fetch_progress.py
"""
import base64
import json
import os
import sys
import urllib.request

TOK = os.environ.get("ER_TOKEN") or ""
OWNER = os.environ.get("ER_OWNER", "1123user")
REPO = os.environ.get("ER_REPO", "er-sync-")
BRANCH = os.environ.get("ER_BRANCH", "main")
FILE = os.environ.get("ER_FILE", "er-sync.json")
OUT = os.environ.get("ER_SNAP", "/tmp/er-sync.json")


def fetch_with_token():
    url = "https://api.github.com/repos/%s/%s/contents/%s" % (OWNER, REPO, FILE)
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "er-rec-cloud")
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return json.loads(base64.b64decode(data.get("content") or "").decode("utf-8"))


def fetch_anon():
    url = "https://raw.githubusercontent.com/%s/%s/%s/%s" % (OWNER, REPO, BRANCH, FILE)
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "er-rec-cloud")
    req.add_header("Cache-Control", "no-cache")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


doc = None
if TOK:
    try:
        doc = fetch_with_token()
        print("✓ 用 ER_TOKEN 读取私有仓库")
    except Exception as e:
        print("⚠ ER_TOKEN 读取失败（%s），改试匿名" % str(e)[:80])
if doc is None:
    try:
        doc = fetch_anon()
        print("✓ 匿名读取（仓库需为 public）")
    except Exception as e:
        sys.exit("✗ 两条路都不通：%s\n"
                 "  在 https://github.com/%s/%s/settings/secrets/actions 配 ER_TOKEN，\n"
                 "  或把该仓库改成 public（数据只有 qid+对错+时间戳，无题干）"
                 % (str(e)[:100], OWNER, REPO))

n = len(doc.get("progress") or {})
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False)
print("→ %s（作答 %d 条）" % (OUT, n))
