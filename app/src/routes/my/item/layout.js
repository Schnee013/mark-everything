import React, { useState, useCallback, useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import sessionStorage from '~modules/sessionStorage'

import * as Reader from '~co/screen/splitview/reader'
import Toolbar from './toolbar'
import Highlights from './highlights'

export default function PageMyItemLayout({ tabs, item, webViewRef }) {
    const { '*':tab } = useParams()

    const [fullscreen, setFullscreen] = useState(false)
    const onFullscreenClick = useCallback(()=>setFullscreen(f=>!f), [])

    useEffect(()=>{sessionStorage.setItem('my-item-last-tab', tab) }, [tab])
    useEffect(()=>()=>{sessionStorage.removeItem('my-item-last-tab')}, [])

    return (
        <Reader.default
            fullscreen={fullscreen}>
            <Reader.Header
                data-no-shadow={tab!='web'}
                backTo='../'
                onFullscreenClick={onFullscreenClick}>
                <Toolbar
                    item={item}
                    tab={tab}
                    tabs={tabs} />
            </Reader.Header>

            <Reader.Content>
                <Outlet />
            </Reader.Content>

            <Highlights 
                item={item}
                tab={tab}
                webViewRef={webViewRef} />
        </Reader.default>
    )
}
