import React from 'react'
import t from '~t'
import { Helmet } from 'react-helmet'
import { Layout, Separator } from '~co/common/form'
import { Header } from '~co/screen/splitview/main'
import { Title } from '~co/common/header'

//common
import Theme from './theme'
import Size from './size'
import Lang from './lang'
import DefaultCollectionView from './default_collection_view'
import RaindropsClick from './raindrops_click'
import RaindropsButtons from './raindrops_buttons'
import TagsSort from './tags_sort'
import NestedViewLegacy from './nested_view_legacy'
import ManagerBrowser from './manager_browser'
import PinyinIndex from './pinyin_index'

export default ()=>{
	return (
		<>
			<Helmet><title>{t.s('appSettings')}</title></Helmet>
			<Header data-fancy><Title>{t.s('app')}</Title></Header>

			<Layout type='grid'>
				<Lang />
				<Theme />
				<Size />
				<Separator />

				<DefaultCollectionView />
				<RaindropsClick />
				<RaindropsButtons />
				<Separator />

				<TagsSort />
				<NestedViewLegacy />
				<Separator />

				<ManagerBrowser />
				{process.env.ME_LOCAL && <PinyinIndex />}
			</Layout>
		</>
	)
}
