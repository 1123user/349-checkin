/* 淘宝开屏（保守版）· 源 zzzghoul5-bit/stash-ios-app-adblock 2026-07-30 v1.1.0；已按零收集规则清理 */
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

  function setIfPresent(object, key, value) {
    if (hasOwn(object, key) && object[key] !== value) {
      object[key] = value;
      return true;
    }
    return false;
  }

  function suppressSplashItem(item) {
    if (!isObject(item)) {
      return false;
    }

    let changed = false;
    const replacements = {
      waitTime: "0",
      times: "0",
      hotStart: "false",
      haveVoice: "false",
      hideTBLogo: "false",
      enable4G: "false",
      coldStart: "false",
      startTime: "3818332800000",
      endTime: "3818419199000",
      gmtStart: "2090-12-31 00:00:00",
      gmtEnd: "2090-12-31 23:59:59",
      gmtStartMs: "3818332800000",
      gmtEndMs: "3818419199000"
    };

    Object.keys(replacements).forEach((key) => {
      changed = setIfPresent(item, key, replacements[key]) || changed;
    });
    if (hasOwn(item, "imgUrl") && item.imgUrl) {
      item.imgUrl = "";
      changed = true;
    }
    if (hasOwn(item, "videoUrl") && item.videoUrl) {
      item.videoUrl = "";
      changed = true;
    }
    return changed;
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
    const splashPath =
      /^\/gw\/mtop\.taobao\.wireless\.home\.splash\.awesome\.get(?:\/\d+(?:\.\d+)*\/?)?$/;
    if (
      !request ||
      request.host !== "guide-acs.m.taobao.com" ||
      !splashPath.test(request.path)
    ) {
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

    if (
      !isObject(body) ||
      !isObject(body.data) ||
      !isObject(body.data.containers) ||
      !isObject(body.data.containers.splash_home_base) ||
      !isObject(body.data.containers.splash_home_base.base) ||
      !Array.isArray(body.data.containers.splash_home_base.base.sections)
    ) {
      finish({});
      return;
    }

    let suppressed = 0;
    body.data.containers.splash_home_base.base.sections.forEach((section) => {
      if (
        !isObject(section) ||
        !isObject(section.bizData) ||
        !hasOwn(section.bizData, "taobao-splash")
      ) {
        return;
      }

      const splash = section.bizData["taobao-splash"];
      if (!isObject(splash) || !Array.isArray(splash.data)) {
        return;
      }
      splash.data.forEach((item) => {
        if (suppressSplashItem(item)) {
          suppressed += 1;
        }
      });
    });

    if (suppressed > 0) {
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

