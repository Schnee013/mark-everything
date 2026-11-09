// Delivery acceptance: installs from the packaged tree into an isolated profile, then uses a real browser.
// Never touches the machine-wide registration, the real user library or the existing ME install.
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = process.env.ME_DELIVERY_TEST_ROOT || '/private/tmp/me-delivery-' + Date.now()
const project = path.resolve(__dirname, '../..')
const stage = process.env.ME_DELIVERY_PACKAGE || (() => { throw new Error('Set ME_DELIVERY_PACKAGE to the extracted release directory') })()
const extension = path.join(stage, 'extension/chrome')
const version = require(path.join(extension, 'manifest.json')).version
const config = path.join(root, 'config')
const helperPath = path.join(config, 'runtime/me-raindrop-host')
const HOST = 'org.me_raindrop_b1.bookmarks'
const result = { root, stage, checks: [] }
const check = (name, value = '') => { result.checks.push({ name, value }); console.log('ok  ', name, value) }

function helper(method, params = {}, libraryId) {
    const out = execFileSync(helperPath, ['--stdio', '--config', config],
        { input: JSON.stringify({ v: 1, id: crypto.randomUUID(), method, params, libraryId }) + '\n', encoding: 'utf8' })
    return JSON.parse(out)
}

;(async () => {
    await fs.mkdir(root, { recursive: true })
    const profile = path.join(root, 'profile')

    // 1. install from the package exactly as a user would, isolated to this profile
    const installed = JSON.parse(execFileSync('/usr/bin/python3',
        [path.join(stage, 'scripts/install.py'), '--config', config, '--profile', profile,
            '--manager-browser', 'chrome', '--manager-profile', profile], { encoding: 'utf8' }))
    result.install = installed
    assert.equal(installed.extensionId, 'egbcchcdoehomdjokeohheklekcdomkj')
    const hostJson = JSON.parse(await fs.readFile(path.join(profile, 'NativeMessagingHosts', HOST + '.json'), 'utf8'))
    assert.deepEqual(hostJson.allowed_origins, ['chrome-extension://' + installed.extensionId + '/'])
    assert.equal(hostJson.path, helperPath)
    const discovery = JSON.parse(await fs.readFile(path.join(config, 'helper-install.json'), 'utf8'))
    assert.equal(discovery.extensionId, installed.extensionId)
    check('installer registers the packaged helper for the fixed id', installed.extensionId)

    // 2. the frozen helper answers over stdio and has no binding yet
    const cap = helper('capabilities')
    assert.equal(cap.ok, true); assert.equal(cap.result.version, version); assert.equal(cap.result.binding, null)
    check('frozen helper: protocol ' + cap.result.protocol + ' v' + cap.result.version + ', unbound')

    // 3. real browser on the packaged extension
    const libraryPath = path.join(root, 'library')
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true, viewport: { width: 1280, height: 900 },
        args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions']
    })
    context.setDefaultTimeout(25000)
    const pageErrors = [], webRequests = []
    context.on('page', p => p.on('pageerror', e => pageErrors.push(e.message)))
    context.on('request', r => { if (/^https?:/.test(r.url())) webRequests.push(r.url()) })
    const cdp = await context.browser().newBrowserCDPSession()
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extension })
    assert.equal(id, installed.extensionId)
    check('browser loads the packaged extension under the registered id', id)

    const page = await context.newPage()
    await page.goto(`chrome-extension://${id}/index.html#/my/0`)
    await page.waitForSelector('input[aria-label="书签库完整路径"]')
    await page.fill('input[aria-label="书签库完整路径"]', libraryPath)
    await page.click('text=在空目录创建')
    await page.waitForSelector('text=All bookmarks')
    const identity = await page.evaluate(() => ({ name: chrome.runtime.getManifest().name, version: chrome.runtime.getManifest().version, title: document.title }))
    assert.equal(identity.name, 'ME'); assert.equal(identity.version, version); assert.notEqual(identity.title, 'Raindrop.io')
    check('local library created from the manager gate, identity ' + JSON.stringify(identity))

    // 4. a write from the helper shows up in the open page, then survives a reload
    const libraryId = helper('capabilities').result.library.libraryId
    const entity = crypto.randomUUID()
    const executed = helper('execute', { id: 'delivery-1', libraryId, edits: [{ entity, kind: 'bookmark',
        values: { url: 'https://example.org/delivery', title: '交付自检书签', note: '交付验收', position: { parent: null, order: 0 } } }] })
    assert.equal(executed.result.state, 'committed-readable')
    for (const q of ['jiaofuzijianshuqian', 'jfzjsq']) {
        assert.equal(helper('query', { q }, libraryId).result.items[0].id, entity)
    }
    check('frozen helper indexes full pinyin and initials on save')
    await page.waitForSelector('text=交付自检书签')
    await page.reload()
    await page.waitForSelector('text=交付自检书签')
    check('helper write is read back by the manager page', entity)

    // 4. manager entry: real page path, item deep link, launch and page acknowledgment
    const resolved = helper('openManager', { launch: false, id: entity })
    assert.equal(resolved.result.path, 'index.html')
    assert.match(resolved.result.fragment, /^\/my\/0\/item\/\d+$/)
    assert.equal(resolved.result.target.extensionId, installed.extensionId)
    check('openManager resolves the real manager page', resolved.result.path + '#' + resolved.result.fragment)

    const launched = helper('openManager', { launch: true })
    result.launch = launched.result
    check('openManager launch returned opened=' + launched.result.opened)
    const recordPath = path.join(config, 'manager-requests', launched.result.requestId + '.json')
    let record = JSON.parse(await fs.readFile(recordPath, 'utf8'))
    if (!record.opened) {
        const handoff = await context.newPage()
        await handoff.goto(`chrome-extension://${id}/index.html?handoff=${record.requestId}&libraryId=${libraryId}#/my/0`)
        await handoff.waitForSelector('text=交付自检书签')
        const deadline = Date.now() + 10000
        while (!record.opened && Date.now() < deadline) {
            record = JSON.parse(await fs.readFile(recordPath, 'utf8'))
            if (!record.opened) await new Promise(r => setTimeout(r, 200))
        }
        await handoff.close()
    }
    assert.equal(record.opened, true)
    check('manager page acknowledged the handoff for the same library', record.requestId)

    const deepLink = await context.newPage()
    await deepLink.goto(`chrome-extension://${id}/index.html#${resolved.result.fragment}`)
    await deepLink.waitForSelector('text=交付自检书签')
    check('item deep link renders the bookmark')
    await deepLink.close()

    // 5. conflicts handoff opens the existing conflicts list on the existing seed fixture
    execFileSync(process.env.ME_TEST_PYTHON || path.join(project, '.venv/bin/python'), [path.join(project, 'app/tests/seed-conflicts.py'), libraryPath, entity], { encoding: 'utf8' })
    const conflicts = await context.newPage()
    await conflicts.goto(`chrome-extension://${id}/index.html?conflicts=1&libraryId=${libraryId}#/my/0`)
    await conflicts.waitForSelector('text=冲突（1）')
    check('conflicts handoff opens the existing conflict list')
    await conflicts.close()

    // 6. the save popup uses the ME mark instead of the upstream logo
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${id}/index.html?action`)
    await popup.waitForSelector('img[alt="ME"]')
    assert.equal(await popup.locator('img[alt="ME"]').evaluateAll(images => images.length > 0 && images.every(img => img.naturalWidth === 32)), true)
    await popup.screenshot({ path: path.join(root, 'popup.png') })
    await page.screenshot({ path: path.join(root, 'manager.png') })
    check('save popup renders the ME mark')
    await popup.close()

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(webRequests, [])
    check('no page errors, no web requests')

    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2))
    await context.close()
    console.log('delivery check passed')
})().catch(async error => {
    result.error = error.message
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2)).catch(() => {})
    console.error('FAILED', error.message)
    process.exit(1)
})
