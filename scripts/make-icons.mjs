import { chromium } from 'playwright'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import path from 'path'

const root = path.resolve('.')
const svg = readFileSync(path.join(root, 'build/icon.svg'), 'utf8')
const pagePath = 'file:///' + path.join(root, 'build/icon.html').replace(/\\/g, '/')

writeFileSync(
  path.join(root, 'build/icon.html'),
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style></head><body><img src="icon.svg"></body></html>`
)

let browser
try {
  browser = await chromium.launch()
} catch {
  const base = path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
  const candidates = [
    ['chrome-win64', 'chrome.exe'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-linux', 'chrome']
  ]
  for (const dir of dirs.reverse()) {
    for (const parts of candidates) {
      const exe = path.join(base, dir, ...parts)
      if (existsSync(exe)) {
        browser = await chromium.launch({ executablePath: exe })
        break
      }
    }
    if (browser) break
  }
  if (!browser) throw new Error('找不到可用的 Chromium，请先执行 npx playwright install chromium')
}
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const pngs = {}
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.goto(pagePath)
  await page.waitForTimeout(120)
  pngs[size] = await page.screenshot({ omitBackground: true })
  await page.close()
}
await browser.close()

writeFileSync(path.join(root, 'build/icon.png'), pngs[1024])
writeFileSync(path.join(root, 'build/icon.ico'), buildIco([16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: pngs[s] }))))
writeFileSync(
  path.join(root, 'build/icon.icns'),
  buildIcns([
    ['icp4', pngs[16]],
    ['icp5', pngs[32]],
    ['icp6', pngs[64]],
    ['ic07', pngs[128]],
    ['ic08', pngs[256]],
    ['ic09', pngs[512]],
    ['ic10', pngs[1024]],
    ['ic11', pngs[32]],
    ['ic12', pngs[64]],
    ['ic13', pngs[256]],
    ['ic14', pngs[512]]
  ])
)
console.log('ICON: build/icon.png / icon.ico / icon.icns')

function buildIco(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((e, i) => {
    const o = 6 + 16 * i
    header.writeUInt8(e.size >= 256 ? 0 : e.size, o)
    header.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1)
    header.writeUInt8(0, o + 2)
    header.writeUInt8(0, o + 3)
    header.writeUInt16LE(1, o + 4)
    header.writeUInt16LE(32, o + 6)
    header.writeUInt32LE(e.data.length, o + 8)
    header.writeUInt32LE(offset, o + 12)
    offset += e.data.length
  })
  return Buffer.concat([header, ...entries.map((e) => e.data)])
}

function buildIcns(chunks) {
  const body = Buffer.concat(
    chunks.map(([type, data]) => {
      const head = Buffer.alloc(8)
      head.write(type, 0, 'ascii')
      head.writeUInt32BE(data.length + 8, 4)
      return Buffer.concat([head, data])
    })
  )
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}