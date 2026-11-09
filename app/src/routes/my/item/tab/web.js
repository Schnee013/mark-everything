import s from './web.module.styl'
import React from 'react'
import WebView from '~co/common/webview'

export default function PageMyItemTabWeb({ item: { _id, link }, webViewRef }) {

    return (
		<WebView
			ref={webViewRef}
			className={s.web}
			src={link} />
	)
}
