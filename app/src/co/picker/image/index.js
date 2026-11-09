import s from './index.module.styl'
import React from 'react'
import t from '~t'
import getThumbUri from '~data/modules/format/thumb'

import Modal, { Header, Content } from '~co/overlay/modal'
import Button from '~co/common/button'
import Icon from '~co/common/icon'
import PickerLink from '~co/picker/link'

export default class PickerImage extends React.Component {
    static defaultProps = {
        items: [], //[{ link }]
        selected: '', //link
        onLink: undefined, //async
        onClose: undefined
    }

    addLink = React.createRef()

    state = {
        addLink: false
    }

    onAddLinkClick = ()=>
        this.setState({ addLink: true })

    onAddLinkClose = ()=>
        this.setState({ addLink: false })

    onLink = async(link)=>{
        await this.props.onLink(link)
        this.props.onClose()
    }

    renderItem = ({ link })=>
        <button 
            key={link}
            className={s.item}
            autoFocus={this.props.selected == link}
            onClick={()=>this.onLink(link)}>
            <img 
                referrerPolicy={process.env.ME_LOCAL ? 'no-referrer' : undefined}
                src={process.env.ME_LOCAL ? link : `${getThumbUri(link)}?mode=crop&width=128&height=96&dpr=${window.devicePixelRatio||1}`} />
        </button>

    render() {
        const { items, onClose } = this.props

        return (
            <Modal onClose={onClose}>
                <Header title={t.s('cover')} data-no-shadow>
                    <Button 
                        ref={this.addLink}
                        variant='link'
                        title={t.s('add')+' URL…'}
                        onClick={this.onAddLinkClick}>
                        <Icon name='add' />
                    </Button>

                    {process.env.ME_LOCAL && <Button variant='link' onClick={() => this.onLink('')}>清除封面</Button>}

                </Header>

                <Content>
                    <div className={s.items}>
                        {items.map(this.renderItem)}


                        {this.state.addLink ? (
                            <PickerLink 
                                pin={this.addLink}
                                onClose={this.onAddLinkClose}
                                onLink={this.onLink} />
                        ) : null}
                    </div>
                </Content>
            </Modal>
        )
    }
}