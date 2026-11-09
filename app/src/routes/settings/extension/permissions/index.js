import React, { useMemo, useEffect, useState, useCallback } from 'react'
import t from '~t'
import browser from '~target/extension/browser'

import { Title, Checkbox } from '~co/common/form'
import { Error } from '~co/overlay/dialog'

function Permission({ required, title }) {
    const [granted, setGranted] = useState(false)
    const [isOptional, setIsOptional] = useState(false)

    useEffect(()=>{
        async function load() {
            setGranted(
                await browser.permissions.contains(required)
            )

            const manifest = browser.runtime.getManifest()
            setIsOptional(required.permissions.every(p=>manifest.optional_permissions.includes(p)))
        }

        load()
        browser.permissions.onAdded.removeListener(load)
        browser.permissions.onAdded.addListener(load)
        browser.permissions.onRemoved.removeListener(load)
        browser.permissions.onRemoved.addListener(load)
    }, [required, setGranted, setIsOptional])

    const onToggle = useCallback((e)=>{
        browser.permissions[e.currentTarget.checked ? 'request' : 'remove'](required)
            .catch(Error)
    }, [required])

    return (
        <Checkbox
            checked={granted}
            disabled={!isOptional}
            onChange={onToggle}>
            {title}
        </Checkbox>
    )
}

export default function SettingsExtensionFeatures() {
    const list = useMemo(()=>[
        [
            { permissions: ['tabs'] },
            { title: '读取并保存浏览器标签页' }
        ]
    ], [])

    return (
        <>
            <Title>
                {t.s('permissions')}
            </Title>

            <div>
                {list.map(([required, details])=>(
                    <Permission
                        {...details}
                        required={required} />
                ))}
            </div>

        </>
    )
}
