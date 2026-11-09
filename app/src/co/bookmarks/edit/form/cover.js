import styles from './cover.module.styl'
import React from 'react'

import Cover from '~co/bookmarks/item/cover'
import Icon from '~co/common/icon'
import ImagePicker from '~co/picker/image'

export default class BookmarkEditFormCover extends React.Component {
    state = {
        modal: false
    }

    onModalOpen = (e)=>{
        e.preventDefault()
        if (!this.props.item._me?.conflictFields?.includes('cover')) this.setState({ modal: true })
    }

    handlers = {
        onClose: ()=>
            this.setState({ modal: false }),

        onLink: async(link)=>{

                if (link && !/^https?:\/\//i.test(link)) throw new Error('封面需使用 HTTP 或 HTTPS 图片地址')
                this.props.onChange({ cover: link })
        }
    }

    render() {
        const { item: { cover, link, media } } = this.props

        return (
            <div className={styles.wrap}>
                <a
                    href=''
                    className={styles.cover}
                    title={'更换封面'}
                    onClick={this.onModalOpen}>
                    <Cover
                        cover={cover}
                        link={link}
                        view='list' />

                    <span className={styles.more}>
                        <Icon name='arrow' />
                    </span>
                </a>

                {this.state.modal && (
                    <ImagePicker
                        items={(media.length ? media : cover ? [{ link: cover }] : []).filter(m => /^https?:\/\//i.test(m.link))}
                        selected={cover}
                        {...this.handlers} />
                )}
            </div>
        )
    }
}
