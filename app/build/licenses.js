const fs = require('node:fs')
const path = require('node:path')

// Preserve the notices of the npm packages actually included in a browser bundle.
module.exports = class DependencyNoticesPlugin {
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('DependencyNotices', compilation => {
            compilation.hooks.processAssets.tap({
                name: 'DependencyNotices',
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
            }, () => {
                const packages = new Map()
                function visit(module) {
                    if (module.modules) for (const child of module.modules) visit(child)
                    if (!module.resource?.includes(`${path.sep}node_modules${path.sep}`)) return
                    let dir = path.dirname(module.resource.split('?')[0])
                    while (dir !== path.dirname(dir)) {
                        const file = path.join(dir, 'package.json')
                        if (fs.existsSync(file)) {
                            const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
                            if (meta.name && meta.version) { packages.set(dir, meta); return }
                        }
                        dir = path.dirname(dir)
                    }
                }
                for (const module of compilation.modules) visit(module)
                const notices = ['Notices for npm packages included in this build.\n']
                for (const [dir, meta] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
                    const files = fs.readdirSync(dir).filter(name => /^(licen[cs]e|copying|notice|copyright)(\.|$)/i.test(name) && fs.statSync(path.join(dir, name)).isFile())
                    const supplemental = path.resolve(__dirname, '../src/me/licenses', `${meta.name}-${meta.version}.txt`)
                    if (!files.length && fs.existsSync(supplemental)) {
                        notices.push(`\n=== ${meta.name}@${meta.version} ===\n${fs.readFileSync(supplemental, 'utf8')}\n`)
                        continue
                    }
                    if (!files.length) {
                        compilation.errors.push(new Error(`Missing distributed license text for ${meta.name}@${meta.version}`))
                        continue
                    }
                    notices.push(`\n=== ${meta.name}@${meta.version} (${typeof meta.license === 'string' ? meta.license : JSON.stringify(meta.license)}) ===\n`)
                    for (const file of files) notices.push(`\n${file}\n${fs.readFileSync(path.join(dir, file), 'utf8')}\n`)
                }
                compilation.emitAsset('licenses/npm-dependencies.txt', new compiler.webpack.sources.RawSource(notices.join('')))
            })
        })
    }
}
