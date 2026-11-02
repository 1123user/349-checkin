/*
 * MITM 自检脚本（小满，2026-11-02）
 * 只做一件事：把 selftest.txt 的响应换成一个固定字符串。
 * 不联网、不写存储、不读 cookie —— tools/audit_no_collect.py 把关。
 */
$done({ body: "MITM-OK · 解密与改写链路是通的" });
