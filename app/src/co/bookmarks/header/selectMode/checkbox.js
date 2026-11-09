import s from './checkbox.module.styl'
import React from 'react'
import t from '~t'
import { connect } from 'react-redux'
import { unselectAll, selectAll } from '~data/actions/bookmarks'

import { FirstAction } from '~co/common/header'
import Button from '~co/common/button'

class BookmarksHeaderSelectModeCheckbox extends React.Component {
    static defaultProps = {
        selectMode: {}
    }

    _allCheckbox = React.createRef()

    componentDidMount() {
        this.updateCheckbox()
    }

    componentDidUpdate(prev) {
        if (prev.selectMode.all != this.props.selectMode.all ||
            prev.selectMode.ids.length != this.props.selectMode.ids.length)
            this.updateCheckbox()
    }

    isAllSelected = () => process.env.ME_LOCAL ? !!this.props.selectMode._allFrozen || !!this.props.loadedIds?.length && this.props.loadedIds.every(id => this.props.selectMode.ids.includes(id)) : this.props.selectMode.all

    updateCheckbox = ()=>{
        const { all, ids } = this.props.selectMode
        this._allCheckbox.current.indeterminate = !this.isAllSelected() && ids.length != 0 ? true : undefined
    }

    onInputClick = ()=>{
        if (this.isAllSelected())
            this.props.unselectAll(this.props.selectMode.spaceId)
        else
            this.props.selectAll(this.props.selectMode.spaceId)
    }

    render() {
        const { selectMode } = this.props

        return (
            <FirstAction>
                <Button 
                    variant='active'
                    onClick={this.onInputClick}>
                    <label className={s.check}>
                        <input 
                            ref={this._allCheckbox}
                            type='checkbox'
                            title={process.env.ME_LOCAL ? '全选当前结果' : t.s('selectAll')}
                            checked={!!this.isAllSelected()}
                            readOnly />
                    </label>
                </Button>
            </FirstAction>
        )
    }
}

export default connect(
    ({bookmarks}, {selectMode}) => ({ loadedIds: bookmarks.spaces[selectMode.spaceId]?.ids || [] }),
	{ unselectAll, selectAll }
)(BookmarksHeaderSelectModeCheckbox)