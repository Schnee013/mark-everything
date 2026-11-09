import React, { useCallback } from 'react'
import t from '~t'
import { useParams } from 'react-router-dom'

import Button from '~co/common/button'
import Icon from '~co/common/icon'
import Sidebar, { Header, Content } from '~co/screen/splitview/sidebar'
import Collections from '~co/collections/items'
import FiltersTags from './filters_tags'
import Profile from './profile'

export default function PageMySidebar() {
    const { cId, search } = useParams()

    const onCreateNewCollectionClick = useCallback(e=>{
        e.preventDefault()

        window.dispatchEvent(
            new CustomEvent('create-new-collection', {
                detail: {
                    asChild: e.shiftKey ? true : false
                }
            })
        )
    }, [])

    let activeId = parseInt(cId)
    if (activeId=='0' && search)
        activeId = search

    return (
        <Sidebar>
            <Header>
                <Profile />

                <Button
                    title={`${t.s('createNewCollection')}\nShift+click: ${t.s('createSubFolder').toLowerCase()}`}
                    onClick={onCreateNewCollectionClick}>
                    <Icon name='add' />
                </Button>
            </Header>

            {process.env.ME_LOCAL && React.createElement(require('../../../me/ConflictNotice').default)}

            <Content>
                <FiltersTags activeId={activeId}>
                    {(customRows, customRowRenderer)=>
                        <Collections
                            activeId={activeId}

                            customRows={customRows}
                            customRowRenderer={customRowRenderer} />
                    }
                </FiltersTags>
            </Content>

            {process.env.ME_LOCAL && React.createElement(require('../../../me/SyncStatus').default)}
        </Sidebar>
    )
}
