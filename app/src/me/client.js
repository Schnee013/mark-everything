import browser from 'webextension-polyfill'

let libraryId
export function setLibrary(id) { libraryId = id }
export function getLibrary() { return libraryId }
export async function send(op, payload = {}) {
    const response = await browser.runtime.sendMessage({ channel: 'me-b1', op, libraryId, ...payload })
    if (!response?.ok) throw Object.assign(new Error(response?.error?.message || '本地连接中断，输入已保留'), response?.error || {})
    return response.result
}

const visible = new Map()
const pendingAcks = new Set()
async function acknowledge() {
    for (const key of pendingAcks) {
        try { await send('api.ack', { key }); pendingAcks.delete(key) }
        catch (_) { /* Cleanup is retryable and cannot turn a confirmed write into a failure. */ }
    }
}
async function request(method, url, data = {}) {
    await acknowledge()
    const match = url.match(/^(?:raindrop|collection)\/(\d+)$/)
    if (match && ['put', 'del'].includes(method)) {
        const item = visible.get(Number(match[1]))
        data = { ...data, _me: data._me || item?._me, _source: data._source || item }
    }
    const result = await send('api', { method, url, data })
    if (result._meReceipt) {
        pendingAcks.add(result._meReceipt)
        await acknowledge()
    }
    for (const item of result.items || (result.item ? [result.item] : [])) if (item._me) visible.set(item._id, item)
    return result
}

const api = {}
for (const method of ['get', 'put', 'post', 'del', 'upload']) {
    api[method] = function* (url, data) { return yield request(method, url, data) }
    api['_' + method] = (url, data) => request(method, url, data)
}
export default api
