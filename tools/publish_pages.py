#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""349-checkin 发布器：走 GitHub Contents API，绕开本地 clone 分叉 / HTTP2 抖动。

    python3 tools/publish_pages.py                      # 默认发布小满：脚本 + 清单
    python3 tools/publish_pages.py AGENTS.md index.html # 发布指定文件
    python3 tools/publish_pages.py --dry                # 只看会推什么

为什么不用 git push：
  本地 clone 经常落后 Actions 的每日提交（tomorrow.json / rec.json / plan3.json），
  一 push 就分叉，rebase 又容易把等价提交重放一遍。API 是「按文件覆盖」，
  天然免疫分叉，也不需要本地历史对齐。

小满约定：xiaoman-v47.js 每次覆盖同一个文件名，manifest 里的 build/ui/size/sha1
必须同步重算，否则手机端「更新小满」会判定版本相同而不更新。
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

OWNER, REPO, BRANCH = "1123user", "349-checkin", "main"
API = "https://api.github.com"
PAGES = "https://1123user.github.io/349-checkin"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

XIAOMAN = "xiaoman-v47.js"
MANIFEST = "xiaoman-latest.json"
DEFAULT = [XIAOMAN, MANIFEST]


def token():
    t = os.environ.get("GH_TOKEN")
    if t:
        return t.strip()
    return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()


def api(tok, path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + tok)
    req.add_header("Accept", "application/vnd.github+json")
    data = json.dumps(body).encode() if body else None
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def local_bytes(name):
    with open(os.path.join(ROOT, name), "rb") as f:
        return f.read()


def remote_bytes(tok, name):
    r = api(tok, "/repos/%s/%s/contents/%s?ref=%s" % (OWNER, REPO, name, BRANCH))
    if not r or not r.get("content"):
        return None, None
    return base64.b64decode(r["content"]), r.get("sha")


def sync_manifest():
    """按真实脚本重算 manifest，避免 build/size/sha1 与文件对不上"""
    p = os.path.join(ROOT, MANIFEST)
    m = json.load(open(p, encoding="utf-8"))
    b = local_bytes(XIAOMAN)
    m["file"] = XIAOMAN
    m["size"] = len(b)
    m["sha1"] = hashlib.sha1(b).hexdigest()[:12]
    json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    print("manifest → build=%s ui=%s size=%d sha1=%s" % (m.get("build"), m.get("ui"), m["size"], m["sha1"]))
    return m


def main():
    args = [a for a in sys.argv[1:] if a != "--dry"]
    dry = "--dry" in sys.argv
    files = args or DEFAULT
    if XIAOMAN in files or not args:
        sync_manifest()   # 默认发布小满时先对齐清单

    tok = token()
    if not tok:
        print("没有 GitHub token（先 gh auth login）")
        return 1

    pushed = 0
    for name in files:
        b = local_bytes(name)
        old, sha = remote_bytes(tok, name)
        if old == b:
            print("%-22s 无变化，跳过" % name)
            continue
        if dry:
            print("%-22s 将更新 %d 字节（远端 %s）" % (name, len(b), "无" if old is None else str(len(old)) + " 字节"))
            continue
        body = {"message": "publish: " + name, "content": base64.b64encode(b).decode(), "branch": BRANCH}
        if sha:
            body["sha"] = sha
        r = api(tok, "/repos/%s/%s/contents/%s" % (OWNER, REPO, name), "PUT", body)
        print("%-22s → %s" % (name, r["commit"]["sha"][:8]))
        pushed += 1

    if dry or not pushed:
        return 0

    # Pages 部署约 45s，轮询到 manifest 的 build 与本地一致为止（有界）
    want = json.load(open(os.path.join(ROOT, MANIFEST), encoding="utf-8")).get("build")
    for i in range(10):
        time.sleep(10)
        try:
            with urllib.request.urlopen(PAGES + "/%s?t=%d" % (MANIFEST, time.time()), timeout=15) as r:
                got = json.load(r).get("build")
        except Exception:
            continue
        if got == want:
            print("线上已生效：%s（约 %ds）" % (got, (i + 1) * 10))
            return 0
    print("⚠ 已推送但线上仍是旧版，过 1 分钟再 curl 一次 manifest 确认")
    return 0


if __name__ == "__main__":
    sys.exit(main())
