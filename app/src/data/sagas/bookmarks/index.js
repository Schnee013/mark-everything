import { all } from 'redux-saga/effects'
import draft from './draft'
import single from './single'
import space from './space'
import selectMode from './selectMode'
import recent from './recent'

export default function* () {
	yield all([
		space(),
		single(),
		draft(),
		selectMode(),
		recent(),
	])
}
