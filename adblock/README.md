# 去开屏 / 去广告（Stash 覆写）

给自己用的那份：**一个文件装完，开屏广告 + 大部分 App 广告位一起没**。

- 一键安装：`https://link.stash.ws/install-override/1123user.github.io/349-checkin/adblock/ads.stoverride`
- 文件：`adblock/ads.stoverride`（约 75 KB，YAML，纯本地改写，不需要节点）

## 里面有什么

| 组成 | 来源 | 规模 |
|---|---|---|
| 通用去广告规则 | [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) · `rewrite/Stash/Advertising`（2025-08-26 版） | 727 条 reject + 686 个 MITM 主机 |
| 淘宝开屏 | `zzzghoul5-bit/stash-ios-app-adblock` 保守版（2026-07-30） | 只让广告素材/时长失效，不动推荐、搜索、购物车、订单、登录、支付 |
| B 站开屏 | 本仓库 `bili/bili-splash.js` | 把 `splash/list` 的广告位清空 |

两段脚本都以 `payload` **内联**在文件里，安装时不依赖 `raw.githubusercontent.com`
（国内直连经常超时，会让 Stash 装到一半失败）。

**已剔除银行 / 支付类 MITM 主机（27 项）**：`icbc / ccb / boc / abchina / cmbchina /
cmbc / spdb / bankcomm / psbc / citic / pingan / webank / alipay / tenpay / unionpay` 等。
它们对开屏收益为零，留着只会增加「证书钉死 → App 打不开」的风险。

## 安装

1. 手机上点上面的链接 → Stash 打开导入页 → 安装；
2. Stash → 设置 → **MitM** → 打开，生成 CA 证书并安装描述文件；
3. 系统 设置 → 通用 → 关于本机 → **证书信任设置** → 打开那条 CA；
4. 杀掉目标 App 重进。

出站策略保持 **直连（DIRECT）** 即可，这条规则只在本地改写响应。

## 零收集（硬指标，可复核）

这条规则明文过手，所以它自己必须「只看不改、改完就丢」。以下四条是**硬性**的，不满足就不合入：

1. **脚本不许联网**：`$httpClient` / `$task.fetch` / `fetch(` / `XMLHttpRequest` /
   `sendBeacon` / `WebSocket` / `new Image(` / `require(` 一律禁止；
2. **不许落盘留痕**：`$persistentStore.write` / `$prefs.setValueForKey` / `localStorage.setItem` /
   写 cookie 一律禁止；连 `console.log` 都在拼装时被剥掉（Stash 日志也不留痕）；
3. **不许有远端脚本源**：所有 JS 以 `payload` 内联，`script-providers` 里出现指向第三方的
   `url:` 直接判失败（只允许自家 `1123user.github.io`，目前一个都没有）；
4. **规则只许 reject**：不允许 `redirect` 之类把流量导去别处的动作。

复核方法（任何一条不通过，整份文件就不该装）：

```bash
python3 tools/audit_no_collect.py adblock bili     # 退出码 0 才算过
```

`tools/build_adblock.py` 已把这条审计设成**门禁**：上游规则集一旦夹带脚本、
或我们拼出来的文件里有任何一处上报/落盘，都会直接报错不落盘。

顺便说清楚边界：MITM 只对文件里列出的 **686 个域名**生效，其余流量不解密；
解密与改写全在手机本地完成，规则本身没有任何出网点。真正会看到你流量的只有
你自己的代理节点（如果开了）—— 那是你选的服务商，不是这套规则。

## 验证结果（2026-11-02）

- 淘宝：伪造 `splash.awesome.get` 响应 → 脚本把 `waitTime` 置 0、`imgUrl` 清空、`endTime` 推到 2090 年；
- B 站：伪造 `splash/list` → `data.list` 清空、`min_interval` 推到 86400；
- 两份脚本在非 JSON / 缺字段 / 空 body 时都原样放行，不会把 App 弄白屏。

## 覆盖不到的

通用规则是按路径正则命中的，App 改接口就失效。已知目前**没有**专项规则的：
抖音、闲鱼、大众点评、剪映、网易云音乐、爱奇艺的开屏。需要的话按 App 补（补的时候优先
找能审的脚本，别用「全域名 REJECT」那种，容易连带把功能打死）。

## 出问题怎么退

Stash → 覆写 → 找到「去开屏 / 去广告（小满）」→ 取消启用（或直接删除）。立刻恢复原状。

## 以后怎么更新

```bash
python3 tools/build_adblock.py            # 从 jsDelivr 拉上游，重新拼（联网）
python3 tools/build_adblock.py --offline  # 只用 adblock/upstream.Advertising.stoverride 缓存
python3 tools/push_plan_api.py adblock/ads.stoverride
```

脚本会自检：重解析生成的文件，确认 727 条规则一条不少、两段 script 都在，
再跑一遍零收集审计，全过才落盘。
