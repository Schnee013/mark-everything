import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { bookmark, tags, makeHighlights, makeIsSelected, makeHighlight, makeSelectModeEnabled, selectModeWorking, getCoverSize } from '~data/selectors/bookmarks'
import * as bookmarksActions from '~data/actions/bookmarks'
import { copyText } from '~modules/browser'
import { openTab } from '~target'

import View from './view'
import Contextmenu from './contextmenu'

class BookmarkItem extends React.Component {
    static defaultProps = {
        //bookmarks
        _id:                0,
        active:             false,
        //collection
        spaceId:            0,
        view:               '', //list, grid, etc...
        access:             {}, //{ level }...
        //funcs
        events:             {}, //same as ...items/index
        actions:            {}, //redux collections
        //special
        innerRef:           undefined
    }

    state = {
        menu: false
    }

    handlers = {
        onClick: (e)=>{
            if (!e) return

            const { selectModeEnabled, item } = this.props
            if (process.env.ME_LOCAL && item._me?.conflictFields?.includes('url')) {
                e.preventDefault()
                return require('../../../me/organize').showConflict(item._me.id)
            }

            if (e.metaKey || e.ctrlKey || e.nativeEvent.which==2){
                e.preventDefault()
                return openTab(item.link)
            }

            if (selectModeEnabled || e.shiftKey){
                e.preventDefault()
                return this.handlers.onSelectClick(e)
            }

            if (typeof this.props.events.onBookmarkClick == 'function' && 
                this.props.events.onBookmarkClick(item))
                e.preventDefault()
        },

        onDoubleClick: (e)=>{
            e.preventDefault()
            if (process.env.ME_LOCAL && this.props.item._me?.conflictFields?.includes('url')) return require('../../../me/organize').showConflict(this.props.item._me.id)
            openTab(this.props.item.link)
        },

        onSelectClick: (e={})=>
            this.props.actions[(this.props.selected && !e.shiftKey) ? 'unselectOne' : 'selectOne'](this.props.spaceId, this.props.item._id, e.shiftKey),

        onImportantClick: ()=>
            this.props.actions.oneImportant(this.props.item._id),
    
        onRemoveClick: ()=> this.props.item._me?.values.life === 'trashed'
            ? require('../../../me/organize').purgeBookmarks([this.props.item])
            : this.props.actions.oneRemove(this.props.item._id),

        onCopyLinkClick: ()=>
            copyText(this.props.item.link),

        onReparseClick: ()=> process.env.ME_LOCAL
            ? require('../../../me/refreshMetadata').refreshMetadata(this.props.item._me)
            : this.props.actions.oneReparse(this.props.item._id),

        onContextMenu: (e)=>{
            e.preventDefault()
            e.target.focus()
            this.setState({ menu: true })
        },
    
        onContextMenuClose: ()=>
            this.setState({ menu: false }),
    
        onKeyUp: (e)=>{
            switch(e.keyCode){
                case 46: //delete
                case 8: //backspace
                    e.preventDefault()
                    return this.handlers.onRemoveClick()
    
                case 13: //enter
                    e.preventDefault()
                    return this.handlers.onClick()
            }
        }
    }

    render() {
        const { item, ...props } = this.props

        return (
            <>
                <View 
                    {...item}
                    {...props}
                    {...this.handlers}
                    />

                {this.state.menu ? (
                    <Contextmenu 
                        {...item}
                        {...props}
                        {...this.handlers} />
                ) : null}
            </>
        )
    }
}

export default connect(
	() => {
        const getIsSelected = makeIsSelected()
        const getHighlight = makeHighlight()
        const getHighlights = makeHighlights()
        const getSelectModeEnabled = makeSelectModeEnabled()
    
        return (state, { _id, spaceId, view })=>{
            const item = bookmark(state, _id)
            const selectModeEnabled = getSelectModeEnabled(state, spaceId)
    
            return {
                item,
                tags: tags(state, _id),
                highlights: getHighlights(state, _id, 3),
                selected: selectModeEnabled ? getIsSelected(state, spaceId, _id) : false,
                selectModeEnabled,
                selectDisabled: selectModeWorking(state) ? true : false,
                highlight: getHighlight(state, spaceId, _id),
                coverSize: getCoverSize(state, view)
            }
        }
    },
    (dispatch)=>({
		actions: bindActionCreators(bookmarksActions, dispatch)
    })
)(BookmarkItem)
