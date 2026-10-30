/*
 * B 站 App 去开屏广告（小满版，2026-10-30）
 * 作用：把 app.bilibili.com/x/v2/splash/list 返回的广告位清空，
 *       App 拿不到素材就只能显示自己的默认启动图。
 * 兼容：Surge / Loon / Stash / Quantumult X / Shadowrocket（都是 $response + $done）
 * 只动开屏接口，不碰登录 / 播放 / 弹幕。
 */
var raw = "";
try { raw = ($response && $response.body) || ""; } catch (e) { raw = ""; }

/* 没拿到 body（客户端没开 require-body / requires-body）就原样放行。
   这里绝不能 $done({ body: "" }) —— 那会把响应写成空，B 站直接白屏。 */
if (!raw || typeof raw !== "string") {
  $done({});
} else {
  var out = raw;
  try {
    var j = JSON.parse(raw);
    var d = j && j.data;
    if (Array.isArray(d)) {
      j.data = [];
    } else if (d && typeof d === "object") {
      var keys = ["list", "splash_list", "items", "data"];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (Array.isArray(d[k]) && d[k].length > 0) d[k] = [];
      }
      if (d.splash) d.splash = null;
      if (d.splash_image) d.splash_image = null;
      /* 顺带把「下次最早什么时候再拉」推到一天后 */
      if (typeof d.min_interval === "number") d.min_interval = 86400;
    }
    out = JSON.stringify(j);
  } catch (e) {
    out = raw;      /* 结构不认识就原样放行，绝不因一条规则把 App 弄坏 */
  }
  $done({ body: out });
}
