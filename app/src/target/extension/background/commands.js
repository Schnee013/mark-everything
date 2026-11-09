import browser from 'webextension-polyfill'
import config from '~config'
import { currentTab } from '~target'
import { open } from './action'

async function onCommand(command, tab) {
    switch(command) {
        case 'save_page':{
            const { url='' } = tab || await currentTab()
            return open(`/add?link=${encodeURIComponent(url)}`)
        }

        case 'open_raindrop_web':
            return browser.tabs.create({
                url: config.links.app.index,
                active: true
            })

        case 'execute_side_panel': {
            const { windowId } = tab
            await browser.sidePanel.open({ windowId })
            //hack to toggle sidepanel
            try { await browser.runtime.sendMessage('closeSidePanel') } catch {}
            return
        }
    }
}

export default function (){
    browser.commands.onCommand.removeListener(onCommand)
    browser.commands.onCommand.addListener(onCommand)
}
