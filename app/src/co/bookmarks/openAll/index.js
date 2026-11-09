import React from 'react'
import t from '~t'
import { connect } from 'react-redux'
import { refresh } from '~data/actions/bookmarks'
import { makeSpaceElements, makeSelectMode, status } from '~data/selectors/bookmarks'
import { target, openTab } from '~target'
import localStorage from '~modules/localStorage'

import Modal, { Header, Content } from '~co/overlay/modal'
import Preloader from '~co/common/preloader'

const _warningKey = 'open-multiple-links-help-ignore'
let showWarning

class BookmarkOpenAll extends React.Component {
    static defaultProps = {
        selected: false,
        onClose: undefined
    }

    componentDidMount() {
        showWarning = target == 'web' && !localStorage.getItem(_warningKey)

        if (!this.props.selected && 
            this.props.status.main != 'loaded')
            this.props.refresh(this.props.spaceId)
        else
            this.open()
    }

    componentDidUpdate(prev) {
        if (prev.status.main != this.props.status.main &&
            this.props.status.main == 'loaded')
            this.open()
    }

    open = ()=>{
        const { onClose, bookmarks, selectMode, selected } = this.props

        if (process.env.ME_LOCAL) {
            const items = selected ? selectMode._items || [] : Object.values(bookmarks)
            if (items.some(item => item._me?.conflictFields?.includes('url'))) {
                require('../../../me/organize').showConflicts()
                return onClose()
            }
        }
        const links = Object.entries(process.env.ME_LOCAL && selected ? selectMode._items || [] : bookmarks)
            //only selected in selectMode
            .filter(([_, { _id }])=>{
                if (selected && !selectMode.all)
                    return selectMode.ids.includes(_id)

                return true
            })
            .map(([_, {link}])=>link)

        //open links
        openTab(links)

        //just close dialog when bookmarks less=1, or warning already showen
        if (links.length <= 1 || !showWarning)
            onClose()
        else {
            localStorage.setItem(_warningKey, 1)
            showWarning = false
        }
    }

    renderBody = ()=>{
        const { status } = this.props

        switch(status.main) {
            case 'loading':
                return (
                    <Header title={t.s('loading')}>
                        <Preloader />
                    </Header>
                )

            case 'empty':
                return (
                    <Header title={t.s('noBookmarks')} />
                )

            case 'loaded':
                return (
                    <>
                        <Header title={t.s('havingProblems')} data-no-shadow />
                        <Content data-indent>
                            浏览器可能拦截一次打开多个标签页，请检查并允许此页面打开新标签页。
                        </Content>
                    </>
                )

            default:
                return (
                    <Header title={t.s('error')} />
                )
        }
    }

    render() {
        const { onClose } = this.props

        return (
            <Modal onClose={onClose}>
                {this.renderBody()}
            </Modal>
        )
    }
}

export default connect(
	()=>{
        const getSpaceElements = makeSpaceElements()
        const getSelectMode = makeSelectMode()

        return (state, { spaceId })=>({
            bookmarks: getSpaceElements(state, spaceId),
            selectMode: getSelectMode(state, spaceId),
            status: status(state, spaceId)
        })
    },
	{ refresh }
)(BookmarkOpenAll)