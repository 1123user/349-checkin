/*
 * B 站 App 去开屏广告（小满版，2026-10-30）
 * 作用：把 app.bilibili.com/x/v2/splash/list 返回的广告位清空，
 *       App 拿不到素材就只能显示自己的默认启动图。
 * 兼容：Surge / Loon / Stash / Quantumult X / Shadowrocket（都是 $response + $done 语法）
 * 只动开屏接口，不碰其它任何 API，不会影响登录 / 播放 / 弹幕。
 */
var raw = "";
try { raw = ($response && $response.body) || ""; } catch (e) { raw = ""; }

function clearArr(o, keys) {
  var hit = false;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (Array.isArray(o[k]) && o[k].length > 0) { o[k] = []; hit = true; }
  }
  return hit;
}

if (raw) {
  try {
    var j = JSON.parse(raw);
    var d = j && j.data;
    if (d && typeof d === "object") {
      if (Array.isArray(d)) { j.data = []; }
      else {
        clearArr(d, ["list", "splash_list", "items", "data"]);
        if (d.splash) d.splash = null;
        if (d.splash_image) d.splash_image = null;
        /* 顺带把「开机图」相关计数字段清零，App 端就不会再排下一次 */
        if (typeof d.min_interval === "number") d.min_interval = 86400;
      }
    }
    raw = JSON.stringify(j);
  } catch (e) {
    /* 解析失败就原样放行，绝不因为一条规则把 App 弄白屏 */
  }
}

$done({ body: raw });
