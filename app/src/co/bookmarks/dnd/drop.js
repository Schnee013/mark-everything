import React from 'react'
import t from '~t'
import { connect } from 'react-redux'
import { oneCreate, oneMove, moveSelected } from '~data/actions/bookmarks'
import PickerFileDrop from '~co/picker/file/drop'
import { Confirm } from '~co/overlay/dialog'
import links from '~config/links'

class BookmarksDropArea extends React.Component {
    static defaultProps = {
        spaceId: 0
    }

    onUploadFile = async(file)=>{
        if (/\.html?$/i.test(file.name)){
            const openImport = await Confirm(
                t.s('importConfirmTitle'),
                {
                    description: t.s('importConfirmDescription'),
                    ok: t.s('importBookmarks')+'…',
                }
            )

            if (openImport)
                window.open(links.app.import)
            return
        }

        throw new Error('当前本地只支持书签 HTML 导入，不支持上传附件')
    }

    onDropLink = (link)=>
        new Promise((res, rej)=>{
            this.props.oneCreate({
                collectionId: parseInt(this.props.spaceId),
                link
            }, res, rej)
        })

    onDropCustom = ([type, data])=>
        new Promise((res, rej)=>{
            switch(type){
                case 'bookmark':
                    this.props.oneMove(parseInt(data), parseInt(this.props.spaceId), res, rej)
                break

                case 'selected_bookmarks':
                    this.props.moveSelected(parseInt(data), parseInt(this.props.spaceId), res, rej)
                break

                default:
                    res()
                break
            }
        })

    onDragCustom = (type)=>
        type == 'bookmark' || type == 'selected_bookmarks'

    render() {
        return (
            <PickerFileDrop
                onFile={this.onUploadFile}
                onLink={this.onDropLink}
                onCustom={this.onDropCustom}
                validateCustom={this.onDragCustom}>
                {this.props.children}
            </PickerFileDrop>
        )
    }
}

export default connect(
	undefined,
	{ oneCreate, oneMove, moveSelected }
)(BookmarksDropArea)
