// Resize the supplied ME artwork without redrawing it. Run on macOS.
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const brand = path.resolve(__dirname, '../src/me/brand')
for (const theme of ['light', 'dark']) {
    for (const size of [16, 24, 32, 48, 128, 512]) {
        execFileSync('/usr/bin/sips', ['-z', String(size), String(size),
            path.join(brand, `ME-${theme}.png`), '--out',
            path.join(brand, `icon_${size}${theme === 'dark' ? '_dark' : ''}.png`)], { stdio: 'ignore' })
    }
}
