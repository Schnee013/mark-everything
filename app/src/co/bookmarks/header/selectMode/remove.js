import React from 'react'
import t from '~t'
import { connect } from 'react-redux'
import { removeSelected } from '~data/actions/bookmarks'

import { Confirm } from '~co/overlay/dialog'
import Button from '~co/common/button'
import Icon from '~co/common/icon'

class BookmarksHeaderSelectModeRemove extends React.Component {
    static defaultProps = {
        selectMode: {}
    }

    onRemoveClick = (e)=>{
        e.preventDefault()

        if (process.env.ME_LOCAL && Number(this.props.selectMode.spaceId) === -99)
            return require('../../../../me/organize').purgeBookmarks(this.props.selectMode._items)

        Confirm(t.s('areYouSure'), { variant: 'warning' })
            .then(yes=>{
                if (!yes) return
                this.props.removeSelected(this.props.selectMode.spaceId)
            })
    }

    render() {
        const { selectMode: { all, ids, spaceId } } = this.props
        const label = process.env.ME_LOCAL && Number(spaceId) === -99 ? '永久删除' : t.s('remove')

        return (
            <Button 
                variant='outline'
                title={label}
                disabled={!all && !ids.length}
                onClick={this.onRemoveClick}>
                <Icon name='trash' />
                
                <span className='hide-on-small-body'>
                    {label}
                </span>
            </Button>
        )
    }
}

export default connect(
	undefined,
	{ removeSelected }
)(BookmarksHeaderSelectModeRemove)