const fs = require('fs')
const locales = require('./locales')

function file({ emitFile }, filename) {
	const name = 'assets/'+filename.split('/').pop()
	emitFile(name, fs.readFileSync(`${__dirname}/${filename}`))
	return name
}

//ME local delivery identity: fixed key keeps the extension ID stable across machines and paths.
const ME_VERSION = '0.2.1'
const ME_NAME = 'ME'
const ME_DESCRIPTION = '自己的书签，留在自己的文件里。离线整理、字段冲突对照与 WebDAV 同步。'
const ME_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmykdquTaPP6jyR9OnUpxZxgGElEd4hGGgEWMRfNzR5k8VS7G2z12Er3GQOTq7FxptWuLsj9zIuVpRahGTP+KvBdWh30+2YTJwJ0W//aq+SCShYgR+5IHOI8pcE4JtQXbgCXnnBJHROVn1FowRjxBlM9zbci/4Sh41v/WVLJLn3dZuf1nyxubZElbyFK3tL0AzWXQe/Qk9UJPtR/Z0LQYjO9A0gyHv7F1mPm6y05JquXK90nTggM7mzMVP72TAfnvt8OxVActnDIywHUF/b34lQcgVkiyHcU0GI1yQv9ICy1Dn3SYDYo1XHL5+Tdl4Oqd6SbjHteO4SIi0FotQPNVeQIDAQAB'

module.exports = ({ vendor, production=false, meLocal=false }, l) => {
	const { version } = JSON.parse(fs.readFileSync(`${__dirname}/../../../../package.json`, 'utf-8'))

	//locales generation
	locales(l)

	const json = {
		manifest_version:3,
        ...(meLocal ? { content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self'; img-src 'self' data: blob: http: https:; frame-src 'self'" } } : {}),

		...(meLocal ? {
			//ME owns its own version line; the upstream number stays in package.json.
			version:		ME_VERSION,
			version_name:	ME_VERSION,
			key:			ME_KEY,
		} : {
			//internal version bigger
			version:		version.replace(/^5/, '6'),
			//showed for user (ignored in firefox)
			...(vendor != 'firefox' ? {
				version_name:	version,
			} : {}),
		}),

		name:			meLocal ? ME_NAME : 'Raindrop.io'+(!production?' (Dev)':''),
		description:	meLocal ? ME_DESCRIPTION : '__MSG_appDesc__',
		...(meLocal ? {} : {
			homepage_url:	'https://app.raindrop.io',
			author:			'Mussabekov Rustem',
		}),
		short_name:		meLocal ? ME_NAME : 'Raindrop.io',
		default_locale:	'en',

		...(vendor=='firefox' ? {
			browser_specific_settings: {
				gecko: {
					id: 'jid0-adyhmvsP91nUO8pRv0Mn2VKeB84@jetpack'
				}
			},
		} : {}),

		icons: meLocal ? {
			16: file(l, '../../../me/brand/icon_16.png'),
			32: file(l, '../../../me/brand/icon_32.png'),
			48: file(l, '../../../me/brand/icon_48.png'),
			128: file(l, '../../../me/brand/icon_128.png')
		} : {
			16: file(l, '../../../assets/brand/icon_16.png'),
			32: file(l, '../../../assets/brand/icon_32.png'),
			48: file(l, '../../../assets/brand/icon_48.png'),
			128: file(l, '../../../assets/brand/icon_128.png')
		},

		background: (
			(vendor == 'firefox' || vendor.startsWith('safari')) ? {
				scripts: ['background.js'],
				...(vendor.startsWith('safari') ? {
					persistent: false
				} : {})
			} : {
				service_worker: 'background.js'
			}
		),

		action: {
			default_popup: 'index.html?action',

			default_icon: vendor == 'firefox' ?
				//firefox
				file(l, '../../../assets/target/extension/action.svg') :
				{
					//chrome based icon
					...(vendor == 'chrome' || vendor == 'edge' || vendor == 'opera' ? (meLocal ? {
						16: file(l, '../../../me/brand/icon_16.png'),
						24: file(l, '../../../me/brand/icon_24.png'),
						32: file(l, '../../../me/brand/icon_32.png')
					} : {
						16: file(l, '../../../assets/target/extension/action_chrome_16.png'),
						24: file(l, '../../../assets/target/extension/action_chrome_24.png'),
						32: file(l, '../../../assets/target/extension/action_chrome_32.png')
					}) : {}),
					//safari icon
					...(vendor.startsWith('safari') ? {
						16: file(l, '../../../assets/target/extension/action_safari_16.png'),
						19: file(l, '../../../assets/target/extension/action_safari_19.png'),
						32: file(l, '../../../assets/target/extension/action_safari_32.png'),
						38: file(l, '../../../assets/target/extension/action_safari_38.png')
					} : {})
				},

			...(vendor == 'firefox' ? {
				default_area: 'navbar'
			} : {})
		},

		permissions: [
			'contextMenus',
			'activeTab',
			'scripting',
			'storage',
            ...(meLocal ? ['nativeMessaging', 'alarms'] : []),
			...(vendor == 'chrome' || vendor == 'edge' ? ['sidePanel'] : []),
			...(vendor == 'safari-ios' ? ['tabs'] : []),

		],

		optional_permissions: [
			...(vendor != 'safari-ios' ? ['tabs'] : []),
		],

		host_permissions: [
			...(!production ? ['http://localhost:3000/*'] : []),

		],

		optional_host_permissions: [
			'*://*/*'
		],

		commands: {
			...(vendor != 'safari' ? {
				_execute_action: {
				}
			} : {}),

			save_page: {
				suggested_key: (vendor == 'chrome' || vendor == 'safari') ? {
					default: 'Ctrl+Shift+S'
				} : {
					default: 'Alt+X',
					mac: 'MacCtrl+X'
				},
				description: '__MSG_savePageOrHighlight__'
			},

			open_raindrop_web: {
				description: '__MSG_openRaindrop__'
			},

			...(vendor == 'chrome' || vendor == 'edge' ? {
				execute_side_panel: {
					suggested_key: {
						default: 'Ctrl+Period'
					},
					description: '__MSG_openSidePanel__'
				}
			}: {}),

			...(vendor == 'firefox' || vendor == 'opera' ? {
				_execute_sidebar_action: {
					suggested_key: {
						default: 'Ctrl+Period'
					},
					description: '__MSG_openSidePanel__'
				}
			}: {}),
		},

		//sidebar
		...(vendor == 'chrome' || vendor == 'edge' ? {
			side_panel: {
				default_path: 'sidepanel.html'
			}
		} : {}),

		...(vendor == 'firefox' || vendor == 'opera' ? {
			sidebar_action: {
				default_panel: 'sidepanel.html',
				default_icon: file(l, '../../../assets/target/extension/action.svg'),
				...(vendor == 'firefox' ? {
					browser_style: false,
					open_at_install: false
				} : {})
			}
		}: {})
	}

	return { code: JSON.stringify(json, null, 2) };
}
