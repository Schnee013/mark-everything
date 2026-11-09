import React, { useMemo, useCallback } from 'react'
import t from '~t'
import { useNavigate } from 'react-router-dom'

import { Space } from '~co/common/header'
import Tabs from '~co/common/tabs'
import Button from '~co/common/button'
import Icon from '~co/common/icon'

export default function PageMyItemToolbar({ item, tab, tabs }) {
    const navigate = useNavigate()

    const tabItems = useMemo(()=>(
        [
            {
                key: 'edit',
                title: t.s('editMin'),
            },
            {
                key: 'web',
                title: 'Web',
            },
        ]
            .filter(({key})=> tabs.includes(key) )
    ), [tabs])

    const onChangeTab = useCallback(tab=>(
        navigate(tab, { replace: true })
    ), [navigate])

    return (
        <>
            <Space/>

            <Tabs
                items={tabItems}
                active={tab}
                onChange={onChangeTab} />

            <Space/>

            <Button
                as='a'
                href={item.link}
                target='_blank'>
                <Icon name='open' />
            </Button>

        </>
    )
}
