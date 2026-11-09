const path = require('path')
const webpack = require('webpack')
const { merge } = require('webpack-merge')
const common = require('./common')

const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const ZipPlugin = require('zip-webpack-plugin')
const DependencyNoticesPlugin = require('./licenses')
const collectionIcons = require('../src/me/collection-icons.json')

module.exports = (env={}, args={}) => {
    const outputPath = path.resolve(__dirname, '..', 'dist', env.vendor, env.production?'prod':'dev')

    env.filename = '[name]'

    if (env.meLocal) {
        const files = require('fs').readdirSync(path.resolve(__dirname, '../src/assets/icons')).filter(name => name.endsWith('.svg')).sort()
        if (JSON.stringify(files) !== JSON.stringify(collectionIcons))
            throw new Error('Collection icon catalog must match the bundled SVG files')
    }

    //prevent mv3 review issues with remote code

    return merge(
        common(env, args),
        {
            //prevent mv3 review issues with remote code
            resolve: {
                alias: {
                    //Replace lodash-es/_root.js that uses `Function('return this')()`
                    [path.resolve(__dirname, '../node_modules/lodash-es/_root.js')]: path.resolve(__dirname, 'polyfills/_root.js'),
                    [path.resolve(__dirname, '../node_modules/core-js/internals/global.js')]: path.resolve(__dirname, 'polyfills/core-js-global.js')
                }
            },

            devtool: false, //extensions just ignore .map files

            entry: {
                manifest: './target/extension/manifest/index.js',
                background: './target/extension/background/index.js'
            },

            output: {
                path: outputPath,
                filename: ({ chunk: { name } }) => name=='background' ? 'background.js' : `assets/${env.filename}.js`,
                chunkFilename: `assets/${env.filename}.js`,
                publicPath: '',
                globalObject: 'globalThis',
                environment: { globalThis: true }
            },

            performance: {
                hints: false //because generated zip always big
            },

            optimization: {
                runtimeChunk: false
            },

            devServer: {
                devMiddleware: {
                    writeToDisk: true
                },
            },

            plugins: [
                ...(env.meLocal ? [new DependencyNoticesPlugin()] : []),
                new HtmlWebpackPlugin({
                    title: 'Raindrop.io',
                    template: './index.ejs',
                    filename: 'sidepanel.html',
                    scriptLoading: 'blocking',
                    inject: 'body',
                    excludeChunks: ['manifest', 'background']
                }),

                new webpack.DefinePlugin({
                    'process.env.APP_TARGET': JSON.stringify('extension'),
                    'process.env.ME_ICON_FILES': JSON.stringify(env.meLocal ? collectionIcons : []),
                    'process.env.EXTENSION_VENDOR': JSON.stringify(env.vendor)
                }),

                new CopyPlugin({
                    patterns: [
                        ...(env.meLocal ? [
                            { from: 'assets/icons/*.svg', to: 'assets/collection-icons/[name][ext]' },
                            { from: path.resolve(__dirname, '../LICENSE.md'), to: 'licenses/raindrop.txt' },
                            { from: 'me/licenses/bookmarker.txt', to: 'licenses/bookmarker.txt' },
                            { from: 'me/licenses/twemoji.txt', to: 'licenses/twemoji.txt' },
                            { from: 'me/licenses/twemoji-source.json', to: 'licenses/twemoji-source.json' }
                        ] : []),
                        ...(env.meLocal ? [{ from: path.resolve(__dirname, '../node_modules/react-diff-viewer-continued/LICENSE'), to: 'licenses/react-diff-viewer-continued.txt' }] : [])
                    ]
                }),

                ...(env.production ? [
                    new ZipPlugin({
                        path: '../../',
                        filename: `${env.vendor}-${env.production?'prod':'dev'}.zip`,
                        exclude: []
                    })
                ] : [])
            ],

            module: {
                rules: [{
                    test: /manifest\/index\.js$/,
                    use: [
                        {
                            loader: 'file-loader',
                            options: {
                                name: 'manifest.json'
                            }
                        },
                        {
                            loader: 'val-loader',
                            options: env
                        }
                    ]
                }]
            }
        }
    )
}
