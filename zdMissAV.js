/*
 * 脚本名称: MissAV 指定链接直接弹窗通知
 * 适用环境: Surge / Loon / Quantumult X / Shadowrocket
 */

const targetUrl = 'https://missav.ai/dm339' // 你指定的网址

const headers = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh-Hans;q=0.9',
    'referer': 'https://missav.ai/'
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

async function getSpecificVideoInfo() {
    try {
        console.log(`🔄 正在请求指定页面: ${targetUrl}`)
        const html = await httpGet(targetUrl)
        
        if (!html || html.length < 500) {
            throw new Error('返回页面数据过短，可能被防火墙拦截或重定向')
        }

        // 提取网页标题 (<title> 或 og:title)
        const titleMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/property="og:title"\s+content="([^"]+)"/)
        const rawTitle = titleMatch ? titleMatch[1].trim() : 'MissAV 视频推荐'

        // 提取视频封面图 (og:image)
        const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/)
        const thumb = imgMatch ? imgMatch[1] : ''

        return {
            title: rawTitle,
            link: targetUrl,
            thumb: thumb
        }

    } catch (e) {
        console.log(`❌ 获取失败: ${e}`)
        throw e
    }
}

// 发送支持点击直接跳转的通知
function sendNotification(title, subTitle, content, link, thumb) {
    const opts = {
        'open-url': link,      // 点击通知时直接打开该网址
        'media-url': thumb,    // 封面预览图
        'auto-dismiss': 300    // 5分钟后自动消失
    }

    if (typeof $notification !== 'undefined') {
        $notification.post(title, subTitle, content, opts)
    } else if (typeof $msg !== 'undefined') {
        $msg(title, subTitle, content, opts)
    }
}

;(() => {
    getSpecificVideoInfo().then(item => {
        const subTitle = '🎬 点击此通知直接跳转观看'
        const content = `标题: ${item.title}`
        
        console.log(`✅ 成功获取: ${item.title}`)
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 指定推送', subTitle, content, item.link, item.thumb)
    }).catch(err => {
        sendNotification('𝐌𝐢𝐬𝐬𝐀𝐕 错误', '运行失败', String(err), targetUrl, '')
    }).finally(() => {
        if (typeof $done !== 'undefined') $done()
    })
})()
