import React, { useEffect, useState } from 'react'
import { send } from '../../../me/client'
import { Label, SubLabel } from '~co/common/form'
import Select from '~co/common/select'

const NAMES = {
    arc: 'Arc',
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge'
}

// The helper launches this browser for the Raycast manager handoff. It changes
// one install-level record; the library, sync settings and credentials stay put.
export default function SettingsAppManagerBrowser() {
    const [browser, setBrowser] = useState('')
    const [busy, setBusy] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        send('session')
            .then(session => {
                if (!alive) return
                setBrowser(session.manager?.browser || '')
                setError('')
            })
            .catch(e => { if (alive) setError(e.message) })
            .finally(() => { if (alive) setBusy(false) })
        return () => { alive = false }
    }, [])

    async function change(next) {
        const previous = browser
        setBrowser(next)
        setBusy(true)
        try {
            await send('configureManager', { params: { browser: next } })
            setError('')
        } catch (e) {
            setBrowser(previous)
            setError(e.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <Label>管理页浏览器</Label>
            <div>
                <Select
                    variant='outline'
                    aria-label='管理页浏览器'
                    value={browser}
                    disabled={busy}
                    onChange={e => change(e.target.value)}>
                    {[
                        ...(!browser ? [['', '读取中…']] : []),
                        ...Object.entries(NAMES)
                    ].map(([key, label]) =>
                        <option key={key} value={key}>{label}</option>
                    )}
                </Select>
                <SubLabel>Raycast 按 ⌘E 时用这个浏览器打开管理页。目标浏览器需已加载 ME 扩展。</SubLabel>
                {browser === 'arc' && <SubLabel>Arc 不接收外部传入的扩展页地址；⌘E 会提示改用 Chrome 或 Edge。</SubLabel>}
                {error && <SubLabel role='status'>未保存：{error}</SubLabel>}
            </div>
        </>
    )
}
