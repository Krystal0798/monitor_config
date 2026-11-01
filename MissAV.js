/*
 * 脚本名称: MissAV 随机推荐通知
 * 适用环境: Surge / Loon / Quantumult X / Shadowrocket
 */

const baseURL = 'https://missav.ws' // 确保你的软件分流或全局代理能够访问
const categoryPath = '/cn/new'   // /cn/new 为最新，/cn/popular 为热门

const headers = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Referer': `${baseURL}/`
}

// 兼容不同软件的网络请求发送方式
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = { url, headers }
        if (typeof $httpClient !== 'undefined') {
            $httpClient.get(req, (err, resp, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        } else if (typeof $task !== 'undefined') {
            $task.fetch(req).then(resp => resolve(resp.body), err => reject(err))
        } else {
            reject('不支持当前运行环境')
        }
    })
}

// 简单正则提取 HTML 中的视频信息（无需复杂的 cheerio 依赖）
async function getVedioInfo() {
    try {
        console.log('🔄 正在请求页面数据...')
        const html = await httpGet(`${baseURL}${categoryPath}`)
        
        // 匹配所有视频卡片块
        const cardRegex = /<div class="group[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
        let match
        let list = []

        while ((match = cardRegex.exec(html)) !== null) {
            const block = match[1]
            
            // 提取链接与标题
            const aMatch = block.match(/href="([^"]+)"[^>]*>([\s\S]*?<\/img>)?([\s\S]*?)<\/a>/)
            // 提取封面图 (适配 data-src 或 src)
            const imgMatch = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/)
            
            if (aMatch) {
                const link = aMatch[1]
                // 清洗标题纯文本
                const rawTitle = block.match(/class="[^"]*text-sm[^"]*"[^>]*>([^<]+)</) || block.match(/alt="([^"]+)"/)
                const title = rawTitle ? rawTitle[1].trim() : '未知标题'
                const thumb = imgMatch ? imgMatch[1] : ''
                
                if (link && title) {
                    list.globale ? '' : list.push({ link, title, thumb })
                }
            }
        }

        // 备用兜底正则（若页面结构微调）
        if (list.length === 0) {
            console.log('⚠️ 尝试备用正则匹配...')
            const simpleLinks = html.match(/href="(\/cn\/[a-zA-Z0-9-\/]+)"/g)
            if (simpleLinks && simpleLinks.length > 0) {
                // 简单提取几个去重
                return {
                    title: 'MissAV 随机推荐',
                    link: baseURL + simpleLinks[0].replace('href="', ''),
                    thumb: ''
                }
            }
            throw new Error('未能在页面中成功解析出视频列表，可能页面结构已更改')
        }

        // 随机挑选一个
        const randomIndex = Math.floor(Math.random() * list.length)
        return list[randomIndex]

    } catch (e) {
        console.log(`❌ 抓取失败: ${e}`)
        throw e
    }
}

// 发送 iOS 系统弹窗通知
function sendNotification(title, subTitle, content, link, thumb) {
    const opts = {
        'open-url': link,
        'media-url': thumb,
        'auto-dismiss': 300 // 5分钟后自动消失
    }

    if (typeof $notification !== 'undefined') {
        // Surge / Stash / Shadowrocket
        $notification.post(title, subTitle, content, opts)
    } else if (typeof $toLocaleDateString !== 'undefined' || typeof $msg !== 'undefined') {
        // Quantumult X / Loon
        $msg(title, subTitle, content, opts)
    } else {
        console.log(`📢 ${title}\n${subTitle}\n${content}\n链接: ${link}`)
    }
}

// 主执行逻辑
;(_async => {
    getVedioInfo().then(item => {
        const fullLink = item.link.startsWith('http') ? item.link : baseURL + item.link
        const subTitle = '🎬 点击直达观看'
        const content = `标题: ${item.title}\n链接: ${fullLink}`
        
        console.log(`✅ 成功获取: ${item.title}`)
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 推荐', subTitle, content, fullLink, item.thumb)
    }).catch(err => {
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 错误', '运行失败', String(err), '', '')
    }).finally(() => {
        if (typeof $done !== 'undefined') $done()
    })
})()
