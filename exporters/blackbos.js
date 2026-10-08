/**
 * Surge Cron 贵金属行情通知脚本
 * Author: 𝕏Panda
 */

const PAGE_URL = "https://www.ip138.com/gold/";
const SHOPS = ["周大福", "六福珠宝", "周生生"];
const MARKETS = ["国际黄金现货", "国际白银现货", "上海黄金现货", "上海白银现货"];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function priceText(v) {
  return v === null || !Number.isFinite(v) ? "--" : "¥" + round2(v);
}

function pctText(v) {
  if (v === null || !Number.isFinite(v)) return "--";
  const x = round2(v);
  return (x >= 0 ? "+" : "") + x + "%";
}

// 封装 Surge $httpClient.get 为 Promise
function httpGet(options) {
  return new Promise((resolve, reject) => {
    $httpClient.get(options, (error, response, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data || "");
      }
    });
  });
}

function parseShopRealtime(html) {
  const out = {};
  for (let i = 0; i < SHOPS.length; i++) {
    const name = SHOPS[i];
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "<span>\\s*" + safe + "\\s*<\\/span>[\\s\\S]{0,1200}?<td[^>]*data-value=\\\"([\\d.]+)\\\"",
      "i"
    );
    const m = html.match(re);
    if (m && m[1] !== undefined) {
      const p = toNum(m[1]);
      if (p !== null) out[name] = p;
    }
  }
  return out;
}

function parseMarketsCnyPerGram(html) {
  const out = {};
  for (let i = 0; i < MARKETS.length; i++) {
    const n = MARKETS[i];
    const re = new RegExp(
      "<td>\\s*" + n + "\\s*<\\/td>[\\s\\S]{0,500}?<span class=\"value\">([\\d.]+)<\\/span>[\\s\\S]{0,260}?<span class=\"value\">([\\d.]+)<\\/span>",
      "i"
    );
    const m = html.match(re);
    if (m) {
      out[n] = {
        tradeRaw: toNum(m[1]),
        cnyPerGram: toNum(m[2]),
      };
    }
  }
  return out;
}

// 获取 USD/CNH 离岸人民币汇率（三重源保障）
async function fetchUsdCnh() {
  // 源 1：腾讯财经 (最稳定)
  try {
    const data = await httpGet({ url: "https://qt.gtimg.cn/q=usdcnh", timeout: 5 });
    const parts = data.split("~");
    if (parts && parts.length > 3) {
      const rate = toNum(parts[3]);
      if (rate && rate > 0) return rate;
    }
  } catch (e) {
    console.log("【贵金属】腾讯汇率源失败: " + e);
  }

  // 源 2：网易财经
  try {
    const data = await httpGet({ url: "https://api.money.126.net/data/feed/FX_USDCNH", timeout: 5 });
    const match = data.match(/\"price\":\s*([\d.]+)/);
    if (match && match[1]) {
      const rate = toNum(match[1]);
      if (rate && rate > 0) return rate;
    }
  } catch (e) {
    console.log("【贵金属】网易汇率源失败: " + e);
  }

  // 源 3：新浪财经
  try {
    const data = await httpGet({ url: "https://hq.sinajs.cn/list=fx_susdcnc", timeout: 5 });
    const match = data.match(/="([^"]+)"/);
    if (match && match[1]) {
      const parts = match[1].split(",");
      const rate = toNum(parts[1]);
      if (rate && rate > 0) return rate;
    }
  } catch (e) {
    console.log("【贵金属】新浪汇率源失败: " + e);
  }

  return null;
}

async function fetchIntlGoldAvg30Cny(usdcnh) {
  if (usdcnh === null) return null;
  try {
    const url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=122.XAU&klt=101&fqt=0&lmt=30&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58";
    const data = await httpGet({ url, timeout: 8 });
    const j = JSON.parse(data);
    const lines = j && j.data && j.data.klines ? j.data.klines : null;
    if (!lines || lines.length === 0) return null;

    const vals = [];
    for (let i = 0; i < lines.length; i++) {
      const p = String(lines[i]).split(",");
      if (p.length < 3) continue;
      const closeUsdPerOz = toNum(p[2]);
      if (closeUsdPerOz === null) continue;
      const cnyPerGram = (closeUsdPerOz * usdcnh) / 31.1034768;
      vals.push(cnyPerGram);
    }
    const a = avg(vals);
    return a === null ? null : round2(a);
  } catch (e) {
    console.log("【贵金属】国际黄金30日均价获取失败: " + e);
    return null;
  }
}

(async () => {
  try {
    const html = await httpGet({
      url: PAGE_URL,
      timeout: 10,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    });

    if (!html || html.length < 500) {
      $notification.post("贵金属行情通知", "获取失败", "IP138网页获取失败");
      return;
    }

    const shopRt = parseShopRealtime(html);
    const markets = parseMarketsCnyPerGram(html);

    // 国际黄金当日价格（人民币/克）
    const ig = markets["国际黄金现货"];
    const intlGoldToday = ig && ig.cnyPerGram !== null ? ig.cnyPerGram : null;

    // 获取离岸汇率并计算 30 日均价
    const fx = await fetchUsdCnh();
    const intlGoldAvg30 = await fetchIntlGoldAvg30Cny(fx);

    // 计算较 30 日均价涨跌幅
    let diffPct = null;
    if (intlGoldToday !== null && intlGoldAvg30 !== null && intlGoldAvg30 > 0) {
      diffPct = ((intlGoldToday - intlGoldAvg30) / intlGoldAvg30) * 100;
    }

    const trendArrow = diffPct === null ? "" : diffPct >= 0 ? "📈 " : "📉 ";

    // 1. 标题构造
    const title = `国际金价: ${priceText(intlGoldToday)}/克 (${trendArrow}${pctText(diffPct)})`;

    // 2. 副标题构造
    const subtitle = `30日均价: ${priceText(intlGoldAvg30)}/克 | 汇率: ${fx ? fx.toFixed(4) : "--"}`;

    // 3. 正文构造 (金店报价 + 现货市场)
    const shopList = SHOPS.map((name) => `${name}: ${priceText(shopRt[name])}`).join(" | ");
    
    const m1 = markets["国际白银现货"];
    const m2 = markets["上海黄金现货"];
    const m3 = markets["上海白银现货"];
    
    const marketList = [
      `国银: ${priceText(m1 ? m1.cnyPerGram : null)}`,
      `沪金: ${priceText(m2 ? m2.cnyPerGram : null)}`,
      `沪银: ${priceText(m3 ? m3.cnyPerGram : null)}`,
    ].join(" | ");

    const body = `【品牌金店】\n${shopList}\n\n【现货市场】\n${marketList}`;

    // 发送推送
    $notification.post(title, subtitle, body);
  } catch (e) {
    console.log("【贵金属脚本异常】" + e);
    $notification.post("贵金属行情通知", "运行异常", e.message || String(e));
  } finally {
    $done();
  }
})();
