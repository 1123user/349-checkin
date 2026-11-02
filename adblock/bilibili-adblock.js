/* B站去广告 · 源 zzzghoul5-bit/stash-ios-app-adblock 2026-07-30 v1.1.0；已按零收集规则清理 */
(() => {
  "use strict";

  const requestUrl =
    typeof $request !== "undefined" && typeof $request.url === "string"
      ? $request.url
      : "";
  const originalBody =
    typeof $response !== "undefined" && typeof $response.body === "string"
      ? $response.body
      : "";
  let finished = false;

  function finish(result) {
    if (!finished) {
      finished = true;
      $done(result || {});
    }
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }


  function parseRequest(url) {
    const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:[?#]|$)/i.exec(url);
    return match
      ? { host: match[1].toLowerCase(), path: match[2] || "/" }
      : null;
  }

  try {
    if (!requestUrl || !originalBody) {
      finish({});
      return;
    }

    const request = parseRequest(requestUrl);
    const allowedHosts = ["app.bilibili.com", "app.biliapi.net"];
    if (!request || allowedHosts.indexOf(request.host) === -1) {
      finish({});
      return;
    }

    let body;
    try {
      body = JSON.parse(originalBody);
    } catch (_) {
      finish({});
      return;
    }

    if (!isObject(body) || !isObject(body.data)) {
      finish({});
      return;
    }

    let removed = 0;
    const splashPath =
      /^\/x\/v2\/splash\/(?:show|list|brand\/list|event\/list2)$/.test(
        request.path
      );

    if (splashPath) {
      ["event_list", "preload", "show"].forEach((key) => {
        if (hasOwn(body.data, key)) {
          delete body.data[key];
          removed += 1;
        }
      });
    } else if (request.path === "/x/v2/feed/index") {
      if (!Array.isArray(body.data.items)) {
        finish({});
        return;
      }

      const basicAdGoto = ["ad_web_s", "ad_av", "ad_web_gif"];
      const inlineAdGoto = [
        "ad_player",
        "ad_inline_3d",
        "ad_inline_eggs",
        "ad_inline_live"
      ];
      const keptItems = [];

      body.data.items.forEach((item) => {
        if (!isObject(item)) {
          keptItems.push(item);
          return;
        }

        const cardType = item.card_type;
        const cardGoto = item.card_goto;
        const isBasicAd =
          (cardType === "cm_v1" || cardType === "cm_v2") &&
          basicAdGoto.indexOf(cardGoto) !== -1;
        const isInlineAd =
          cardType === "cm_v2" && inlineAdGoto.indexOf(cardGoto) !== -1;
        const isDoubleAd =
          cardType === "cm_double_v9" && cardGoto === "ad_inline_av";

        if (isBasicAd || isInlineAd || isDoubleAd) {
          removed += 1;
          return;
        }

        const isBannerCard =
          (cardType === "banner_v8" || cardType === "banner_ipad_v8") &&
          cardGoto === "banner";
        if (isBannerCard && Array.isArray(item.banner_item)) {
          const originalLength = item.banner_item.length;
          item.banner_item = item.banner_item.filter(
            (banner) => !(isObject(banner) && banner.type === "ad")
          );
          removed += originalLength - item.banner_item.length;

        }

        keptItems.push(item);
      });

      body.data.items = keptItems;
    } else if (request.path === "/x/v2/feed/index/story") {
      if (!Array.isArray(body.data.items)) {
        finish({});
        return;
      }

      const storyAdGoto = [
        "vertical_ad_av",
        "vertical_ad_picture",
        "vertical_ad_live"
      ];
      body.data.items = body.data.items.filter((item) => {
        if (!isObject(item)) {
          return true;
        }
        if (item.card_goto === "vertical_pgc") {
          return true;
        }
        const isAd =
          hasOwn(item, "ad_info") ||
          storyAdGoto.indexOf(item.card_goto) !== -1;
        if (isAd) {
          removed += 1;
          return false;
        }
        return true;
      });
    } else {
      finish({});
      return;
    }

    if (removed > 0) {
      void 0;
      finish({ body: JSON.stringify(body) });
    } else {
      finish({});
    }
  } catch (error) {
    const message =
      error && typeof error.message === "string" ? error.message : "unknown";
    void 0;
    finish({});
  }
})();

