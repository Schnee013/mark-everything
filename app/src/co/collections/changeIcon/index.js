import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import * as collectionsActions from '~data/actions/collections'

import PickerIcon from '~co/picker/icon'

class CollectionChangeIcon extends React.Component {
    static defaultProps = {
        _id: 0
    }

    source = this.props.source

    onLink = (link)=>
        new Promise((res, rej)=>
            this.props.actions.oneUpdate(this.props._id, { cover: [link], ...(this.source ? { _me: this.source._me, _source: this.source } : {}) }, res, rej)
        )

    render() {
        return (
            <PickerIcon
                {...this.props}
                onLink={this.onLink} />
        )
    }
}

export default connect(
    (state, { _id }) => ({ source: process.env.ME_LOCAL ? state.collections.items[_id] : undefined }),
	(dispatch)=>({
        actions: bindActionCreators(collectionsActions, dispatch)
    }),
)(CollectionChangeIcon)
