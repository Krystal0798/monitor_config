/**
 * Surge 脚本：烧饼论坛 (sb.sb) 专属订阅通知（含正文摘要）
 * 兼容 Surge 4+ 环境
 */

// 你的专属 RSS 订阅地址
const RSS_URL = "https://sb.sb/feed/fpr4UJqtATVXQcKiV8F4U16Qy-B21EQv0rMxDCac5cw/rss.xml";
const STORAGE_KEY = "sbsb_custom_last_guid";
const MAX_NOTIFY_COUNT = 5; // 单次最多推送数量

$httpClient.get({ url: RSS_URL, headers: { "User-Agent": "Surge-Script" } }, function (error, response, data) {
    if (error) {
        $notification.post("烧饼论坛监控", "获取失败", error);
        $done();
        return;
    }

    if (response.status !== 200) {
        $notification.post("烧饼论坛监控", "获取失败", `HTTP 状态码: ${response.status}`);
        $done();
        return;
    }

    try {
        const posts = parseRSS(data);
        if (posts.length === 0) {
            $done();
            return;
        }

        const lastGuid = $persistentStore.read(STORAGE_KEY) || "";
        let newPosts = [];

        // 查找自上次记录以来的新动态
        for (let post of posts) {
            if (post.guid === lastGuid) break;
            newPosts.push(post);
        }

        if (newPosts.length > 0) {
            // 更新最新记录
            $persistentStore.write(newPosts[0].guid, STORAGE_KEY);

            // 按时间正序推送，限制最大条数防止刷屏
            newPosts.reverse();
            const sendList = newPosts.slice(-MAX_NOTIFY_COUNT);

            for (let post of sendList) {
                // 如果有正文内容则显示正文，否则提示点击查看
                const bodyText = post.summary ? post.summary : "点击查看详情";
                const subTitle = post.author ? `来自: ${post.author}` : "烧饼论坛新动态";

                $notification.post(
                    post.title,
                    subTitle,
                    bodyText,
                    { url: post.link }
                );
            }
        }
    } catch (e) {
        $notification.post("烧饼论坛监控", "解析出错", e.message);
    }

    $done();
});

/**
 * 解析 RSS 并提取纯文本正文摘要
 */
function parseRSS(xml) {
    let items = [];
    let itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);
    
    if (!itemMatches) return items;

    for (let itemStr of itemMatches) {
        let title = extractTag(itemStr, "title");
        let link = extractTag(itemStr, "link");
        let guid = extractTag(itemStr, "guid") || link;
        let author = extractTag(itemStr, "dc:creator") || extractTag(itemStr, "author");
        let rawDesc = extractTag(itemStr, "description") || extractTag(itemStr, "content:encoded");

        title = decodeHtml(title);
        let summary = cleanSummary(rawDesc);

        if (title && link) {
            items.push({ title, link, guid, author, summary });
        }
    }
    return items;
}

function extractTag(xml, tag) {
    let regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`, "i");
    let match = xml.match(regex);
    return match ? match[1].trim() : "";
}

/**
 * 清洗 HTML 标签并截断过长正文，适配通知栏显示
 */
function cleanSummary(rawHtml) {
    if (!rawHtml) return "";
    // 1. 反转义 HTML 实体
    let text = decodeHtml(rawHtml);
    // 2. 去除所有 <p>、<img>、<br> 等 HTML 标签，替换为空格
    text = text.replace(/<[^>]+>/g, " ");
    // 3. 合并多余的换行与空格
    text = text.replace(/\s+/g, " ").trim();
    // 4. 截取前 100 个字符，避免通知框被撑得过大
    if (text.length > 100) {
        text = text.substring(0, 100) + "...";
    }
    return text;
}

function decodeHtml(html) {
    return html
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
}
