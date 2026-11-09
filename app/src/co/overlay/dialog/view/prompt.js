import s from './prompt.module.styl'
import React from 'react'
import t from '~t'
import Modal, { Header, Content } from '~co/overlay/modal'
import Button from '~co/common/button'
import { Layout, Text } from '~co/common/form'

export default class DialogPromptView extends React.PureComponent {
    state = {
        value: (this.props.value||'') + ''
    }

    onFieldChange = e =>
        this.setState({ value: e.target.value })

    onSubmit = e => {
        e.preventDefault()
        e.stopPropagation()
        this.props.sendResult(this.props.id, this.state.value)
    }

    onCancel = () => {
        this.props.sendResult(this.props.id, '')
    }

    render() {
        const { message, ok, cancel, description, multiline, stretch } = this.props
        const { value } = this.state
        const FormContent = stretch ? Content : 'form'

        return (
            <Modal 
                className={s.prompt}
                stretch={stretch}
                important={true}
                onClose={this.onCancel}>
                <Header 
                    title={message}
                    data-no-shadow />
    
                <FormContent {...(stretch ? { as: 'form' } : {})} onSubmit={this.onSubmit}>
                    <Layout>
                        {description ? <div className={s.description}>{description}</div> : null}

                        <Text 
                            autoFocus
                            selectAll
                            autoSize
                            multiline={multiline}
                            value={value}
                            onChange={this.onFieldChange} />

                        <Button 
                            data-block
                            as='input'
                            type='submit'
                            variant='primary'
                            value={ok || 'OK'} />

                        <Button 
                            data-block
                            variant='outline'
                            onClick={this.onCancel}>
                            {cancel || t.s('cancel')}
                        </Button>
                    </Layout>
                </FormContent>
            </Modal>
        )
    }
}
