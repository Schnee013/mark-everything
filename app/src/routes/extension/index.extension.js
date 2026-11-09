import React from 'react'
import { Route } from 'react-router-dom'

import Protected from '../_protected'
import Clipper from './clipper'
import Tabs from './tabs'

export default ()=>{
	return (<>
		<Route element={<Protected redirect />}>
			<Route path='clipper' element={<Clipper />} />
			<Route path='tabs/:collectionId' element={<Tabs />} />
		</Route>

	</>)
}
