import browser from '../browser'
import { currentTab } from '../currentTab'
import parse from './parse?asis'

import { detectType } from '../../../me/content-type'

export async function getMeta(tab, { strict = false } = {}) {
    const { id, url: link, title } = tab || await currentTab()

    try{
        if (browser.scripting) {
            const [res] = await browser.scripting.executeScript({
                target: { tabId: id },
                files: [parse],
                injectImmediately: true
            })
            if (res?.result?.link) {
                const { ogType, ...item } = res.result
                if (process.env.ME_LOCAL) {
                    if (link && item.link !== link) throw new Error('网页地址已变化，请重新读取')
                    item.type = detectType(item.link, ogType || '')
                }
                return item
            }
        }
    } catch (e) {
        if (strict) throw e
        console.log(e)
    }

    //fallback if meta fail
    if (strict) throw new Error('未能读取此网页')
    return { link, title }
}