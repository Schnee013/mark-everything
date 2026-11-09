import s from './file.module.styl'
import React from 'react'
import t from '~t'
import { connect } from 'react-redux'
import { upload, cancel } from '~data/actions/import'

import { Error } from '~co/overlay/dialog'
import { Label } from '~co/common/form'
import Button from '~co/common/button'
import Icon from '~co/common/icon'
import Alert from '~co/common/alert'
import Preloader from '~co/common/preloader'

class ImportFile extends React.Component {
    input = React.createRef()

    onFileUpload = e=>{
        if (!e.target.files[0]) return

        this.props.upload(e.target.files[0], undefined, e=>{
            Error(e)
            this.input.current.value = ''
        })
    }

    renderButton = ()=>{
        const { file: { status, name, count }, cancel } = this.props

        switch(status) {
            case 'loading':
                return (
                    <Button>
                        <Preloader/>
                        {t.s('uploadProgress')}
                    </Button>
                )

            case 'loaded':
                return (
                    <div className={s.loaded}>
                        <b>{name}</b><br />
                        <span>
                            {count.folders} {t.s('folders').toLowerCase()}, {count.bookmarks} {t.s('bookmarks')}, {count.tags} {t.s('tags').toLowerCase()}, {count.highlights} {t.s('highlights').toLowerCase()}
                        </span>

                    </div>
                )

            case 'empty':
                return (
                    <div>
                        <Alert variant='warning'>
                            <b>{t.s('noBookmarks')}</b>
                        </Alert>
                        <br />
        
                        <Button
                            variant='outline'
                            onClick={cancel}>
                            <Icon name='refresh' />
                            {t.s('selectOtherFile')}
                        </Button>
                    </div>
                )

            default:
                return (
                    <div>
                        <Alert>
                            <b>选择 HTML 书签文件</b>.<br />
                            使用同一文件名再次导入时复用来源匹配；备注、标签及已删除条目受本地保护。<br /><br />
                        </Alert>
                        <br />
        
                        <Button 
                            as='label'
                            variant='primary'>
                            <Icon name='upload' />
                            选择文件
        
                            <input 
                                ref={this.input}
                                type='file'
                                accept='.html,.htm,text/html'
                                style={{display: 'none'}}
                                onChange={this.onFileUpload} />
                        </Button>
                    </div>
                )
        }
    }

    render() {
        return (
            <>
                <Label>{t.s('file')}</Label>

                {this.renderButton()}
            </>
        )
    }
}

export default connect(
    state => ({
        file: state.import.file
    }),
    { upload, cancel }
)(ImportFile)