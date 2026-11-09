//react
import './wdyr'
import React from 'react'
import { render } from 'react-dom'

//polyfills
import 'form-request-submit-polyfill'
import 'intersection-observer'

//redux
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/es/integration/react'
import { withLocalReducer } from '~data'
import localReducers from './local/reducers'

import ServiceWorker from '~modules/sw/component'
import Translate from '~modules/translate/component'
import Routes from '~routes'
import Document from './routes/_document'
import App from './routes/_app'
import Splash from './routes/_splash'

//init redux
const { store, persistor } = withLocalReducer(localReducers)

//render app
render(
	//!add other global components in co/screen/basic
	<>
		<Document>
			<ServiceWorker>
				<Provider store={store}>
					<PersistGate loading={<Splash />} persistor={persistor}>
						<Translate loading={<Splash />}>
							<App>
								<Routes />
							</App>
						</Translate>
					</PersistGate>
				</Provider>
			</ServiceWorker>
		</Document>
	</>,
	
	document.getElementById('react')
)
