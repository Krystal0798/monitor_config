/**
 * ============================================================================
 * 黑料不打烊 - Surge 定时获取更新与推送通知脚本 (Cron)
 * 当前默认绑定站点：https://among.bhqgjhkt.cc/
 * ============================================================================
 *
 * 【功能特性】
 * 1. 开箱即用：已内置 https://among.bhqgjhkt.cc 为默认站点，无需额外传参即可直接运行。
 * 2. 双模式解析：优先尝试解析标准 RSS 源（/feed/），若不可用则自动降级解析网页文章卡片与 /archives/ 链接。
 * 3. 智能过滤置顶帖：自动跳过首页固定的“防走失/永久地址/官方APP下载”等置顶公告，确保推送真正的最新吃瓜内容。
 * 4. 防重复打扰：利用 Surge 本地持久化存储 ($persistentStore) 记录最新文章，支持仅在有新帖时推送。
 * 5. 点击直达：适配 Surge 原生 open-url 动作，点击通知横幅即可在浏览器中直接打开对应文章。
 *
 * ============================================================================
 * 【Surge 配置方法】
 * 请在您的 Surge 配置文件的 [Script] 模块中添加以下任一配置：
 *
 * 方式一：默认配置（每天 12:00 和 20:00 推送最新 3 条内容）
 * [Script]
 * 黑料不打烊定时通知 = type=cron, cronexp="0 12,20 * * *", wake-system=1, timeout=20, script-path=heiliao_cron.js
 *
 * 方式二：进阶参数配置（每 2 小时静默检查一次，仅在发现新帖发布时才弹窗通知）
 * [Script]
 * 黑料不打烊定时通知 = type=cron, cronexp="0 */2 * * *", wake-system=1, timeout=20, script-path=heiliao_cron.js, argument="url=https://among.bhqgjhkt.cc/&only_new=true&max_items=3&filter_pinned=true"
 *
 * 【可选参数说明 (argument)】
 * - url           : 选填，默认已设为 https://among.bhqgjhkt.cc ，后续若域名变更可通过此参数或 BoxJS 覆盖
 * - only_new      : 选填，true = 仅有新文章发布时才弹窗通知；false = 每次定时触发都推送（默认 false）
 * - max_items     : 选填，单次通知最多展示的标题条数，默认为 3
 * - filter_pinned : 选填，是否自动过滤首页“永久域名/APP下载/防走失”等置顶公告帖，默认为 true
 * ============================================================================
 */

const SCRIPT_NAME = "黑料不打烊";
const STORE_LAST_LINK_KEY = "hlbd_last_post_link";
const STORE_DOMAIN_KEY = "hlbd_custom_domain";

// 默认配置项（已默认绑定 https://among.bhqgjhkt.cc）
const DEFAULT_CONFIG = {
  url: "https://among.bhqgjhkt.cc",
  only_new: false,
  max_items: 3,
  filter_pinned: true,
  timeout: 15000, // 毫秒
};

// 主执行入口
(async () => {
  try {
    console.log(`[${SCRIPT_NAME}] 开始执行定时检查任务...`);

    // 1. 解析并合并运行参数
    const config = loadConfig();
    if (!config.url) {
      $notification.post(
        SCRIPT_NAME,
        "⚠️ 未配置站点地址",
        "请在 Surge 脚本的 argument 中设置 url=https://最新域名，后再运行脚本。"
      );
      return;
    }

    // 规范化基础域名（去除末尾斜杠）
    const baseUrl = config.url.replace(/\/+$/, "");
    console.log(`[${SCRIPT_NAME}] 当前目标站点: ${baseUrl}`);

    // 2. 获取并解析文章列表（优先尝试 RSS，失败后回退至网页 HTML 解析）
    let articles = await fetchArticles(baseUrl, config.timeout, config.filter_pinned);

    if (!articles || articles.length === 0) {
      console.log(`[${SCRIPT_NAME}] 未能解析到任何文章内容，可能是域名已失效、节点不通或开启了人机验证。`);
      $notification.post(
        SCRIPT_NAME,
        "❌ 获取内容失败",
        `无法从 ${baseUrl} 解析文章，请检查代理策略或确认域名是否可用。`,
        {
          action: "open-url",
          url: baseUrl,
        }
      );
      return;
    }

    console.log(`[${SCRIPT_NAME}] 成功获取 ${articles.length} 篇文章，最新一篇: ${articles[0].title}`);

    // 3. 检查是否为新更新内容（去重判断）
    const latestArticle = articles[0];
    const lastPushedLink = $persistentStore.read(STORE_LAST_LINK_KEY) || "";
    const isNewUpdate = latestArticle.link !== lastPushedLink;

    if (config.only_new && !isNewUpdate) {
      console.log(`[${SCRIPT_NAME}] 暂无新内容更新（最新篇目未变），本次跳过通知推送。`);
      return;
    }

    // 记录最新一篇文章链接至持久化存储
    if (latestArticle.link) {
      $persistentStore.write(latestArticle.link, STORE_LAST_LINK_KEY);
    }

    // 4. 组装通知文案并发送 Surge 系统通知
    const displayList = articles.slice(0, config.max_items);
    const subtitle = isNewUpdate ? "🔥 发现最新内容更新！" : "📌 今日热门内容速览";
    const bodyLines = displayList.map((item, idx) => `${idx + 1}. ${item.title}`);
    const notificationBody = bodyLines.join("\n");

    // 适配 Surge 5 标准点击跳转格式，点击通知横幅直接拉起浏览器打开文章
    const targetOpenUrl = latestArticle.link || baseUrl;
    $notification.post(
      SCRIPT_NAME,
      subtitle,
      notificationBody,
      {
        action: "open-url",
        url: targetOpenUrl,
      }
    );

    console.log(`[${SCRIPT_NAME}] 通知推送完成！跳转链接: ${targetOpenUrl}`);
  } catch (error) {
    const errMsg = error && error.message ? error.message : String(error);
    console.log(`[${SCRIPT_NAME}] 脚本运行异常: ${errMsg}`);
    $notification.post(SCRIPT_NAME, "⚠️ 脚本执行异常", errMsg);
  } finally {
    // 必须调用 $done() 结束 Surge 脚本生命周期
    $done();
  }
})();

/**
 * 读取并解析 Surge 传入的 $argument 参数与持久化存储配置
 */
function loadConfig() {
  const cfg = Object.assign({}, DEFAULT_CONFIG);

  // 先尝试读取持久化存储中的自定义域名（方便配合 BoxJS 或面板动态更新域名）
  const storedDomain = $persistentStore.read(STORE_DOMAIN_KEY);
  if (storedDomain && storedDomain.trim()) {
    cfg.url = storedDomain.trim();
  }

  // 解析 Surge [Script] 中的 argument="key1=val1&key2=val2"
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
        const parsedNum = parseInt(val, 10);
        if (!isNaN(parsedNum) && parsedNum > 0) {
          cfg.max_items = parsedNum;
        }
      } else if (key === "filter_pinned") {
        cfg.filter_pinned = val.toLowerCase() !== "false" && val !== "0";
      }
    }
  }

  return cfg;
}

/**
 * 尝试通过多种途径抓取站点最新文章列表
 * @param {string} baseUrl 目标站点地址
 * @param {number} timeout 超时时间(ms)
 * @param {boolean} filterPinned 是否过滤首页固定置顶公告帖
 */
async function fetchArticles(baseUrl, timeout, filterPinned) {
  // 如果用户直接填了 .xml 或 /feed 地址，直接按请求解析
  const isDirectFeed = /\/(feed|rss)(\/|\.xml)?$/i.test(baseUrl);
  const candidateUrls = isDirectFeed
    ? [baseUrl]
    : [
        `${baseUrl}/feed/`,           // Typecho / WordPress 标准 RSS 路径
        `${baseUrl}/index.php/feed/`, // 未开启伪静态时的 Typecho RSS 路径
        `${baseUrl}/`,                // 回退至直接抓取站点首页 HTML
      ];

  for (const targetUrl of candidateUrls) {
    try {
      console.log(`[${SCRIPT_NAME}] 尝试请求: ${targetUrl}`);
      const responseText = await httpGet(targetUrl, timeout, `${baseUrl}/`);
      if (!responseText) continue;

      // 判断返回内容是否为 XML / RSS 格式
      if (responseText.includes("<rss") || responseText.includes("<feed") || responseText.includes("<item>")) {
        const rssItems = parseRSS(responseText, baseUrl);
        if (rssItems.length > 0) {
          console.log(`[${SCRIPT_NAME}] 通过 RSS 源成功解析 ${rssItems.length} 条记录`);
          return filterPinned ? filterPinnedArticles(rssItems) : rssItems;
        }
      }

      // 否则按 HTML 页面结构提取文章列表
      const htmlItems = parseHTML(responseText, baseUrl);
      if (htmlItems.length > 0) {
        console.log(`[${SCRIPT_NAME}] 通过 HTML 页面成功解析 ${htmlItems.length} 条记录`);
        return filterPinned ? filterPinnedArticles(htmlItems) : htmlItems;
      }
    } catch (err) {
      console.log(`[${SCRIPT_NAME}] 请求 ${targetUrl} 失败: ${err.message || err}`);
    }
  }

  return [];
}

/**
 * 解析标准 RSS 2.0 / Atom XML 文本
 * @param {string} xml XML 字符串
 * @param {string} baseUrl 基础域名（用于补全相对路径）
 */
function parseRSS(xml, baseUrl) {
  const results = [];
  // 匹配 <item>...</item> 或 <entry>...</entry>
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // 提取标题
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? cleanText(titleMatch[1]) : "";

    // 提取链接（兼容标准 <link>url</link> 与 Atom <link href="url" />）
    let link = "";
    const linkTagMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkTagMatch && linkTagMatch[1].trim()) {
      link = cleanText(linkTagMatch[1]);
    } else {
      const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkHrefMatch) {
        link = linkHrefMatch[1].trim();
      }
    }

    if (title) {
      results.push({
        title,
        link: normalizeUrl(link, baseUrl),
      });
    }
  }

  return results;
}

/**
 * 解析网页 HTML 提取文章标题与链接（针对 among.bhqgjhkt.cc 等 Typecho 卡片主题深度适配）
 * @param {string} html 网页源码
 * @param {string} baseUrl 基础域名
 */
function parseHTML(html, baseUrl) {
  const results = [];
  const seenLinks = new Set();

  // 辅助入库函数（带统一清洗与有效性校验）
  const pushCandidate = (rawHref, rawTitleText) => {
    if (!rawHref || /^(javascript:|#|mailto:)/i.test(rawHref.trim())) return;

    // 过滤分类页、标签页、分页、作者页等非正文链接
    if (/\/(category|tag|page|author|search|user|login|register)\//i.test(rawHref)) return;

    let title = cleanText(rawTitleText.replace(/<[^>]+>/g, " "));
    // 剔除卡片内可能连带抓取到的日期后缀或“置顶”角标字样
    title = title
      .replace(/^\[?置顶\]?\s*/i, "")
      .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?(\s+\d{1,2}:\d{2}(:\d{2})?)?\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title || title.length < 5) return;
    if (/^(阅读全文|查看更多|置顶|首页|下一页|上一页|点击进入|立即查看)$/i.test(title)) return;

    const fullLink = normalizeUrl(rawHref.trim(), baseUrl);
    if (!seenLinks.has(fullLink)) {
      seenLinks.add(fullLink);
      results.push({ title, link: fullLink });
    }
  };

  // 模式 1：整张瀑布流卡片被 <a href="/archives/..."> 包裹，内部嵌套 h2/h3 或 class 含 title 的标题节点
  const cardLinkRegex = /<a[^>]+href=["']([^"']*\/(?:archives|post|article|p)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardLinkRegex.exec(html)) !== null) {
    const href = match[1];
    const innerHtml = match[2];

    // 优先提取卡片内部的标题容器（如 <h2 class="post-card-title">...</h2> 或 <div class="...title...">）
    const innerHeading =
      innerHtml.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
      innerHtml.match(/<(?:div|p|span)[^>]+class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);

    if (innerHeading && innerHeading[1]) {
      pushCandidate(href, innerHeading[1]);
    } else {
      pushCandidate(href, innerHtml);
    }
  }

  // 模式 2：传统结构 <h2><a href="...">标题</a></h2>
  if (results.length === 0) {
    const headingLinkRegex = /<h[1-4][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[1-4]>/gi;
    while ((match = headingLinkRegex.exec(html)) !== null) {
      pushCandidate(match[1], match[2]);
    }
  }

  return results;
}

/**
 * 过滤首页长期置顶的防走失、导航、APP下载等官方公告帖，避免干扰新内容检测
 * @param {Array<{title: string, link: string}>} items 原始文章数组
 */
function filterPinnedArticles(items) {
  if (!items || items.length === 0) return [];

  const pinnedKeywords = /(永久地址|回家地址|防走失|防迷路|备用域名|最新地址|官方APP|客户端下载|APP下载|谨防诈骗|商务合作|广告招租|置顶公告|必看公告)/i;
  const filtered = items.filter((item) => !pinnedKeywords.test(item.title));

  // 若全部条目均命中关键词（极端情况），保留原列表以免返回空结果
  return filtered.length > 0 ? filtered : items;
}

/**
 * 清理 CDATA 标记、HTML 实体字符及多余空白
 * @param {string} str 原始字符串
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
 * 将相对路径补全为完整的 HTTP(S) 链接
 * @param {string} link 提取到的链接
 * @param {string} baseUrl 站点根域名
 */
function normalizeUrl(link, baseUrl) {
  if (!link) return baseUrl;
  if (/^https?:\/\//i.test(link)) return link;
  if (link.startsWith("//")) return `https:${link}`;
  if (link.startsWith("/")) return `${baseUrl}${link}`;
  return `${baseUrl}/${link}`;
}

/**
 * 封装 Surge $httpClient.get 为 Promise（附带完整移动端请求头与防缓存控制）
 * @param {string} url 请求地址
 * @param {number} timeout 超时毫秒数
 * @param {string} referer 引用来源地址
 */
function httpGet(url, timeout, referer) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      url: url,
      timeout: Math.floor(timeout / 1000), // Surge 的 timeout 单位为秒
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: referer || url,
      },
    };

    $httpClient.get(requestOptions, (error, response, data) => {
      if (error) {
        return reject(new Error(String(error)));
      }
      const status = response ? response.status || response.statusCode : 0;
      if (status >= 200 && status < 400 && data) {
        resolve(data);
      } else {
        reject(new Error(`HTTP 状态码异常: ${status}`));
      }
    });
  });
}
