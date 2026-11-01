#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把私有仓库里的作答记录拉到本地 /tmp/er-sync.json

  GitHub Actions 里跑（电脑不开机也能跑）。凭证来自仓库 Secrets：
    ER_TOKEN  私有数据仓库的 PAT（fine-grained，只需要 Contents:Read）
    ER_OWNER  默认 1123user
    ER_REPO   默认 er-sync-
    ER_FILE   默认 er-sync.json

  本地也能手动跑：ER_TOKEN=xxx python3 tools/fetch_progress.py
"""
import base64
import json
import os
import sys
import urllib.request

TOK = os.environ.get("ER_TOKEN") or ""
OWNER = os.environ.get("ER_OWNER", "1123user")
REPO = os.environ.get("ER_REPO", "er-sync-")
FILE = os.environ.get("ER_FILE", "er-sync.json")
OUT = os.environ.get("ER_SNAP", "/tmp/er-sync.json")

if not TOK:
    sys.exit("✗ 没有 ER_TOKEN（Actions 里配 Secrets，本地用环境变量）")

url = "https://api.github.com/repos/%s/%s/contents/%s" % (OWNER, REPO, FILE)
req = urllib.request.Request(url)
req.add_header("Authorization", "Bearer " + TOK)
req.add_header("Accept", "application/vnd.github+json")
req.add_header("X-GitHub-Api-Version", "2022-11-28")
req.add_header("User-Agent", "er-rec-cloud")

try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
except Exception as e:
    sys.exit("✗ 拉取失败：%s" % e)

raw = base64.b64decode(data.get("content") or "")
doc = json.loads(raw.decode("utf-8"))
n = len(doc.get("progress") or {})
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False)
print("→ %s（作答 %d 条）" % (OUT, n))
