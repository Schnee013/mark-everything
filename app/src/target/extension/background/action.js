import browser from 'webextension-polyfill'

export async function open(path) {
    if (!path)
        return browser.action.openPopup()

    const { default_popup } = browser.runtime.getManifest().action

    await browser.action.setPopup({ popup: `${default_popup}#${path}` })
    try {
        await browser.action.openPopup()
    } finally {
        //always restore, even if opening failed
        await browser.action.setPopup({ popup: default_popup })
    }
}
