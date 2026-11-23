/**
 * ============================================================================
 * 黑料不打烊 - Surge 定时获取更新与推送通知脚本 (Cron 增强修复版)
 * 当前默认绑定站点：https://among.bhqgjhkt.cc/
 * ============================================================================
 *
 * 【本次修复重点】
 * 1. 修复语法异常：移除文件首尾多余的代码块标记，避免 JS 引擎解析报错导致静默退出。
 * 2. 防止超时被杀：改为优先请求站点首页（单次超时缩短至 8 秒），避免轮询不存在的 RSS 导致总耗时超过 Surge 限制而无通知。
 * 3. 增强卡片解析：同时兼容 <a href="/archives/...">、?path=/archives/... 以及黑料不打烊常见的 onclick="location.href='/archives/...'" 瀑布流卡片结构。
 * 4. 通知兼容降级：使用全版本 Surge 通用的 { url } 跳转参数，并内置异常回退，确保无论成功或失败都有明确通知反馈。
 *
 * ============================================================================
 * 【Surge 配置方法】
 * 请在 Surge 配置文件的 [Script] 模块中添加（注意 script-path 需与实际保存路径一致）：
 *
 * [Script]
 * 黑料不打烊定时通知 = type=cron, cronexp="0 12,20 * * *", wake-system=1, timeout=30, script-path=heiliao_cron.js
 *
 * 若需每 2 小时检查一次且仅在有新帖时通知：
 * 黑料不打烊定时通知 = type=cron, cronexp="0 */2 * * *", wake-system=1, timeout=30, script-path=heiliao_cron.js, argument="only_new=true&max_items=3"
 * ============================================================================
 */

const SCRIPT_NAME = "黑料不打烊";
const STORE_LAST_LINK_KEY = "hlbd_last_post_link";
const STORE_DOMAIN_KEY = "hlbd_custom_domain";

const DEFAULT_CONFIG = {
  url: "https://among.bhqgjhkt.cc",
  only_new: false,
  max_items: 3,
  filter_pinned: true,
  timeoutSec: 8, // 单次 HTTP 请求超时秒数（控制在 8s 内防止触发 Surge 整体脚本超时）
};

(async () => {
  try {
    console.log(`[${SCRIPT_NAME}] ====== 开始执行脚本 ======`);

    const config = loadConfig();
    if (!config.url) {
      notify(SCRIPT_NAME, "⚠️ 未配置站点地址", "请在 argument 中设置 url=https://最新域名");
      return;
    }

    const baseUrl = config.url.replace(/\/+$/, "");
    console.log(`[${SCRIPT_NAME}] 目标站点: ${baseUrl} | 仅推新帖: ${config.only_new}`);

    // 抓取并解析文章列表（带诊断信息）
    const result = await fetchArticlesWithDiag(baseUrl, config.timeoutSec, config.filter_pinned);
    const articles = result.articles;

    if (!articles || articles.length === 0) {
      const diagMsg = result.diag || "未能匹配到文章列表，请检查代理分流或域名有效性";
      console.log(`[${SCRIPT_NAME}] 解析为空，诊断信息: ${diagMsg}`);
      notify(
        SCRIPT_NAME,
        "❌ 未能解析到文章内容",
        `${diagMsg}\n站点: ${baseUrl}`,
        baseUrl
      );
      return;
    }

    console.log(`[${SCRIPT_NAME}] 成功提取 ${articles.length} 篇文章，首篇: ${articles[0].title}`);

    // 新帖去重校验
    const latestArticle = articles[0];
    const lastPushedLink = ($persistentStore.read(STORE_LAST_LINK_KEY) || "").trim();
    const isNewUpdate = latestArticle.link !== lastPushedLink;

    if (config.only_new && !isNewUpdate) {
      console.log(`[${SCRIPT_NAME}] 最新文章未变化 (${latestArticle.link})，跳过本次通知`);
      return;
    }

    if (latestArticle.link) {
      $persistentStore.write(latestArticle.link, STORE_LAST_LINK_KEY);
    }

    // 组装通知文本
    const displayList = articles.slice(0, config.max_items);
    const subtitle = isNewUpdate ? "🔥 发现最新内容更新！" : "📌 今日热门内容速览";
    const notificationBody = displayList
      .map((item, index) => `${index + 1}. ${item.title}`)
      .join("\n");

    const targetOpenUrl = latestArticle.link || baseUrl;
    notify(SCRIPT_NAME, subtitle, notificationBody, targetOpenUrl);
    console.log(`[${SCRIPT_NAME}] 通知已发送，点击跳转: ${targetOpenUrl}`);
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    console.log(`[${SCRIPT_NAME}] 未捕获异常: ${errMsg}`);
    notify(SCRIPT_NAME, "⚠️ 脚本运行异常", errMsg);
  } finally {
    $done();
  }
})();

/**
 * 统一封装 Surge 通知函数（兼容新旧版本 Surge，防止参数不兼容导致不弹窗）
 */
function notify(title, subtitle, body, openUrl) {
  try {
    if (openUrl) {
      // Surge 官方规范：仅传 { url } 即自动识别为点击打开链接，兼容更多版本
      $notification.post(title, subtitle, body, { url: openUrl });
    } else {
      $notification.post(title, subtitle, body);
    }
  } catch (e) {
    console.log(`[${SCRIPT_NAME}] 带参通知发送失败，降级为基础通知: ${e}`);
    $notification.post(title, subtitle, body);
  }
}

/**
 * 读取默认配置、持久化域名及 argument 参数
 */
function loadConfig() {
  const cfg = Object.assign({}, DEFAULT_CONFIG);

  const storedDomain = $persistentStore.read(STORE_DOMAIN_KEY);
  if (storedDomain && storedDomain.trim()) {
    cfg.url = storedDomain.trim();
  }

  if (typeof $argument === "string" && $argument.trim() !== "") {
    const pairs = $argument.split("&");
    for (const pair of pairs) {
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const key = decodeURIComponent(pair.slice(0, idx).trim());
      const val = decodeURIComponent(pair.slice(idx + 1).trim());

      if (key === "url" && val) {
        cfg.url = val;
      } else if (key === "only_new") {
        cfg.only_new = val.toLowerCase() === "true" || val === "1";
      } else if (key === "max_items") {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) cfg.max_items = num;
      } else if (key === "filter_pinned") {
        cfg.filter_pinned = val.toLowerCase() !== "false" && val !== "0";
      }
    }
  }

  return cfg;
}

/**
 * 优先请求站点首页 HTML，快速回退 RSS，附带详细的失败原因诊断
 */
async function fetchArticlesWithDiag(baseUrl, timeoutSec, filterPinned) {
  const isDirectFeed = /\/(feed|rss)(\/|\.xml)?$/i.test(baseUrl);
  // 优先请求首页（速度最快、不易 404 卡死），其次再尝试 /feed/
  const candidateUrls = isDirectFeed
    ? [baseUrl]
    : [`${baseUrl}/`, `${baseUrl}/feed/`];

  let lastDiag = "";

  for (const targetUrl of candidateUrls) {
    try {
      console.log(`[${SCRIPT_NAME}] 正在请求: ${targetUrl}`);
      const { status, data } = await httpGet(targetUrl, timeoutSec, `${baseUrl}/`);

      if (!data) {
        lastDiag = `HTTP ${status} 返回内容为空`;
        continue;
      }

      // 检测是否触发了 Cloudflare 盾或人机验证
      if (
        /Just a moment|cf-browser-verification|challenge-platform|Attention Required/i.test(data) &&
        data.length < 30000
      ) {
        lastDiag = "站点开启了 Cloudflare 人机验证盾，脚本直接请求被拦截";
        continue;
      }

      // 1. 尝试按 RSS/XML 解析
      if (data.includes("<rss") || data.includes("<feed") || data.includes("<item>")) {
        const rssItems = parseRSS(data, baseUrl);
        if (rssItems.length > 0) {
          return {
            articles: filterPinned ? filterPinnedArticles(rssItems) : rssItems,
            diag: "OK (RSS)",
          };
        }
      }

      // 2. 尝试按 HTML / 内嵌脚本解析
      const htmlItems = parseHTML(data, baseUrl);
      if (htmlItems.length > 0) {
        return {
          articles: filterPinned ? filterPinnedArticles(htmlItems) : htmlItems,
          diag: "OK (HTML)",
        };
      }

      // 记录页面标题辅助排查（例如域名变成导航页或前端加密壳）
      const pageTitleMatch = data.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = pageTitleMatch ? cleanText(pageTitleMatch[1]) : "无标题";
      lastDiag = `页面已返回(长度:${data.length}, 标题:${pageTitle})，但未识别出文章卡片(可能为前端动态解密渲染)`;
    } catch (err) {
      lastDiag = `请求失败: ${err.message || err}`;
      console.log(`[${SCRIPT_NAME}] ${targetUrl} -> ${lastDiag}`);
    }
  }

  return { articles: [], diag: lastDiag };
}

/**
 * 解析标准 RSS / Atom
 */
function parseRSS(xml, baseUrl) {
  const results = [];
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : "";

    let link = "";
    const linkTagMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkTagMatch && linkTagMatch[1].trim()) {
      link = cleanText(linkTagMatch[1]);
    } else {
      const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkHrefMatch) link = linkHrefMatch[1].trim();
    }

    if (title) {
      results.push({ title, link: normalizeUrl(link, baseUrl) });
    }
  }
  return results;
}

/**
 * 多模式 HTML 解析器（适配黑料不打烊常见的 onclick 瀑布流卡片、/archives/ 链接及内联 JSON）
 */
function parseHTML(html, baseUrl) {
  const results = [];
  const seenLinks = new Set();

  const pushCandidate = (rawHref, rawTitleHtml) => {
    if (!rawHref) return;
    const cleanHref = rawHref.trim();
    if (/^(javascript:|#|mailto:)/i.test(cleanHref)) return;
    if (/\/(category|tag|page|author|search|user|login|register)\//i.test(cleanHref)) return;

    let title = cleanText(String(rawTitleHtml || "").replace(/<[^>]+>/g, " "));
    title = title
      .replace(/^\[?置顶\]?\s*/i, "")
      .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?(\s+\d{1,2}:\d{2}(:\d{2})?)?\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title || title.length < 4) return;
    if (/^(阅读全文|查看更多|置顶|首页|下一页|上一页|点击进入|立即查看|黑料不打烊)$/i.test(title)) return;

    const fullLink = normalizeUrl(cleanHref, baseUrl);
    if (!seenLinks.has(fullLink)) {
      seenLinks.add(fullLink);
      results.push({ title, link: fullLink });
    }
  };

  let match;

  // 模式 1：黑料不打烊瀑布流常见的 onclick 跳转卡片（如 <div class="post-card" onclick="location='/archives/123.html'">...<h2>标题</h2>）
  const onclickCardRegex = /<(?:div|article|li)[^>]+onclick=["'][^"']*?((?:https?:\/\/[^"'\s]+)?\/?(?:\?path=)?\/?(?:archives|post|article|p)\/[^"'\s)]+)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi;
  while ((match = onclickCardRegex.exec(html)) !== null) {
    const href = match[1];
    const inner = match[2];
    const heading =
      inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
      inner.match(/<(?:div|p|span)[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);
    pushCandidate(href, heading ? heading[1] : inner);
  }

  // 模式 2：<a href=".../archives/..."> 卡片或标题链接（同时支持 ?path=/archives/xxx.html）
  const archiveLinkRegex = /<a[^>]+href=["']([^"']*?(?:\?path=)?\/(?:archives|post|article|p)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = archiveLinkRegex.exec(html)) !== null) {
    const href = match[1];
    const inner = match[2];
    const heading =
      inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
      inner.match(/<(?:div|p|span)[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);
    pushCandidate(href, heading ? heading[1] : inner);
  }

  // 模式 3：常规 <h1-h4><a href="...">标题</a></h1-h4>
  if (results.length === 0) {
    const headingRegex = /<h[1-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1-4]>/gi;
    while ((match = headingRegex.exec(html)) !== null) {
      pushCandidate(match[1], match[2]);
    }
  }

  // 模式 4：若页面采用脚本内嵌 JSON 数据（如 {"cid":12345,"title":"..."} 或 {"title":"...","url":"/archives/..."}）
  if (results.length === 0) {
    const jsonCidRegex = /"cid"\s*:\s*"?(\d+)"?\s*,\s*"title"\s*:\s*"([^"]{5,})"|"title"\s*:\s*"([^"]{5,})"\s*,\s*"cid"\s*:\s*"?(\d+)"?/g;
    while ((match = jsonCidRegex.exec(html)) !== null) {
      const cid = match[1] || match[4];
      const rawTitle = decodeUnicodeEscapes(match[2] || match[3]);
      pushCandidate(`/archives/${cid}.html`, rawTitle);
    }
  }

  return results;
}

/**
 * 过滤置顶导航、APP下载等公告帖
 */
function filterPinnedArticles(items) {
  if (!items || items.length === 0) return [];
  const pinnedKeywords = /(永久地址|回家地址|防走失|防迷路|备用域名|最新地址|官方APP|客户端下载|APP下载|谨防诈骗|商务合作|广告招租|置顶公告|必看公告)/i;
  const filtered = items.filter((item) => !pinnedKeywords.test(item.title));
  return filtered.length > 0 ? filtered : items;
}

/**
 * 解码 JSON 中的 \uXXXX 中文转义字符
 */
function decodeUnicodeEscapes(str) {
  if (!str) return "";
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * 文本清洗
 */
function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 规范化 URL
 */
function normalizeUrl(link, baseUrl) {
  if (!link) return baseUrl;
  if (/^https?:\/\//i.test(link)) return link;
  if (link.startsWith("//")) return `https:${link}`;
  if (link.startsWith("/")) return `${baseUrl}${link}`;
  return `${baseUrl}/${link}`;
}

/**
 * Surge $httpClient.get 请求封装
 */
function httpGet(url, timeoutSec, referer) {
  return new Promise((resolve, reject) => {
    const options = {
      url: url,
      timeout: timeoutSec,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Cache-Control": "no-cache",
        Referer: referer || url,
      },
    };

    $httpClient.get(options, (error, response, data) => {
      if (error) {
        return reject(new Error(String(error)));
      }
      const status = response ? response.status || response.statusCode : 0;
      if (status >= 200 && status < 400) {
        resolve({ status, data: data || "" });
      } else {
        reject(new Error(`HTTP 状态码 ${status}`));
      }
    });
  });
}
