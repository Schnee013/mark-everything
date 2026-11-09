import React from 'react'
import { Route, Navigate } from 'react-router-dom'

import Layout from './layout'
import App from './app'
import Extension from './extension'
import Import from './import'

export default function PageSettings() {
    return (
        <Route element={<Layout />}>
            <Route index element={<Navigate replace to='app' />} />
            <Route path='app' element={<App />} />
            <Route path='extension' element={<Extension />} />
            <Route path='sync' element={React.createElement(require('../../me/CloudSettings').default)} />
            <Route path='import' element={<Import />} />
            <Route path='*' element={<Navigate replace to='/my/0' />} />
        </Route>
    )
}
