/*
 * 脚本名称: MissAV 随机推荐通知 (支持点击直接跳转)
 * 适用环境: Surge / Loon / Quantumult X / Shadowrocket
 */

const baseURL = 'https://missav.ai/dm339'
const categoryPath = '/cn/new'

const headers = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh-Hans;q=0.9',
    'referer': `${baseURL}/`
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = { url, headers, timeout: 10 }
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

async function getVedioInfo() {
    try {
        console.log('🔄 正在请求页面数据...')
        const html = await httpGet(`${baseURL}${categoryPath}`)
        
        if (!html || html.length < 500) {
            throw new Error('返回页面数据过短，可能被防火墙拦截或重定向')
        }

        let list = []
        const linkRegex = /href="(https:\/\/missav\.ws\/cn\/[a-zA-Z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g
        let match

        while ((match = linkRegex.exec(html)) !== null) {
            const link = match[1]
            const content = match[2]
            
            if (link.includes('/cn/new') || link.includes('/cn/popular') || link.includes('/cn/actresses')) {
                continue
            }

            const titleMatch = content.match(/alt="([^"]+)"/) || content.match(/class="[^"]*text-sm[^"]*"[^>]*>([^<]+)</)
            const imgMatch = content.match(/data-src="([^"]+)"/) || content.match(/src="([^"]+)"/)

            const title = titleMatch ? titleMatch[1].trim() : ''
            const thumb = imgMatch ? imgMatch[1] : ''

            if (link && title) {
                list.push({ link, title, thumb })
            }
        }

        if (list.length === 0) {
            console.log('⚠️ 尝试二级解析模式...')
            const altRegex = /alt="([^"]+)"[^>]*href="([^"]+)"/g
            while ((match = altRegex.exec(html)) !== null) {
                list.push({ title: match[1], link: match[2], thumb: '' })
            }
        }

        if (list.length === 0) {
            throw new Error('未能解析出有效视频，请检查代理节点是否正常访问该网站')
        }

        const uniqueList = Array.from(new Set(list.map(a => a.link)))
            .map(link => list.find(a => a.link === link))

        const randomIndex = Math.floor(Math.random() * uniqueList.length)
        return uniqueList[randomIndex]

    } catch (e) {
        console.log(`❌ 抓取失败: ${e}`)
        throw e
    }
}

// 核心优化：发送支持点击直接跳转的通知
function sendNotification(title, subTitle, content, link, thumb) {
    const opts = {
        'open-url': link,      // 点击通知时打开的网页链接
        'media-url': thumb,    // 封面预览图
        'auto-dismiss': 300    // 5分钟后自动消失
    }

    if (typeof $notification !== 'undefined') {
        // Surge / Stash / Shadowrocket 专属通知参数绑定
        $notification.post(title, subTitle, content, opts)
    } else if (typeof $msg !== 'undefined') {
        // Quantumult X / Loon
        $msg(title, subTitle, content, opts)
    }
}

;(() => {
    getVedioInfo().then(item => {
        const fullLink = item.link.startsWith('http') ? item.link : baseURL + item.link
        const subTitle = '🎬 点击此通知直接跳转观看'
        const content = `标题: ${item.title}`
        
        console.log(`✅ 成功获取: ${item.title}`)
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 推荐', subTitle, content, fullLink, item.thumb)
    }).catch(err => {
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 错误', '运行失败', String(err), '', '')
    }).finally(() => {
        if (typeof $done !== 'undefined') $done()
    })
})()
