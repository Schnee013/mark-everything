import React from 'react'
import t from '~t'
import { Helmet } from 'react-helmet'
import { Layout } from '~co/common/form'
import { Header } from '~co/screen/splitview/main'
import { Title } from '~co/common/header'

import File from './file'
import Parcel from './parcel'

export default function Import() {

	return (
		<>
			<Header data-fancy>
				<Title>{t.s('import')}</Title>
			</Header>

			<Layout type='grid'>
				<Helmet><title>{t.s('import')}</title></Helmet>

				<File />
				<Parcel />
			</Layout>
		</>
	)
}
