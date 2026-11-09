import React from 'react'
import browser from 'webextension-polyfill'
import { getMeta } from '~target/extension/getMeta'
import { Alert, Confirm, Error as ShowError } from '~co/overlay/dialog'
import { Checkbox, Layout } from '~co/common/form'
import api from './client'

// Old ME reads a background tab after a per-site grant, then closes that tab.
async function readPage(url) {
    const origin = new URL(url).origin + '/*'
    if (!await browser.permissions.request({ origins: [origin] })) throw new Error('未授权读取这个网站')
    const tab = await browser.tabs.create({ url, active: false })
    try {
        await new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timer)
                browser.tabs.onUpdated.removeListener(updated)
                if (error) reject(error)
                else resolve()
            }
            const updated = (id, info) => {
                if (id === tab.id && info.status === 'complete') finish()
            }
            const timer = setTimeout(() => finish(new Error('网页加载超时')), 20000)
            browser.tabs.onUpdated.addListener(updated)
            browser.tabs.get(tab.id).then(current => updated(tab.id, current), finish)
        })
        const item = await getMeta({ id: tab.id, url }, { strict: true })
        if (item.link !== url) throw new Error('网页地址已变化，请重新读取')
        return item
    } finally {
        await browser.tabs.remove(tab.id).catch(() => {})
    }
}

export async function refreshMetadata(source) {
    try {
        if (source.values.life !== 'active' || source.conflictFields.includes('url')) throw new Error('请先恢复书签或处理网址冲突')
        const page = await readPage(source.values.url)
        const next = { title: page.title || '', description: page.excerpt || '', cover: page.cover || '', type: page.type }
        const names = { title: '标题', description: '摘要', cover: '封面', type: '类型' }
        const changed = Object.keys(next).filter(key => !source.conflictFields.includes(key) && next[key] !== (source.values[key] ?? ''))
        if (!changed.length) return Alert('网页信息与当前可编辑字段相同')
        const chosen = {}
        const accepted = await Confirm('刷新网页信息', { ok: '接受所选变化', description:
            <Layout>{changed.map(key => <Checkbox key={key} aria-label={'用网页' + names[key]} onChange={e => {
                if (e.target.checked) chosen[key] = next[key]
                else delete chosen[key]
            }}>用网页{names[key]}：{source.values[key] || '（空）'} → {next[key] || '（空）'}</Checkbox>)}</Layout> })
        if (accepted && Object.keys(chosen).length) {
            await api._post('me/metadata', { source, values: chosen })
            window.dispatchEvent(new Event('me-organized'))
        }
    } catch (error) { await ShowError(error) }
}
