import { _electron as electron } from 'playwright'
import path from 'path'
const app = await electron.launch({ executablePath: path.resolve('release/win-unpacked/CloudReel.exe'), args: [], timeout: 60000 })
const page = await app.firstWindow({ timeout: 60000 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)
const info = await page.evaluate(() => window.cloudreel.appInfo())
const s = await page.evaluate(() => window.cloudreel.getSettings())
const projects = await page.evaluate(() => window.cloudreel.projectsList())
console.log('FFMPEG OK:', info.ffmpeg.ok, info.ffmpeg.path)
console.log('DATA DIR:', process.env.APPDATA + '\cloudreel')
console.log('LLM:', s.llm.presetId, '| TTS:', s.tts.provider, '| STOCK:', s.stock.provider)
console.log('PROJECTS:', projects.map((p) => ({ title: p.title, outputs: p.outputs })))
await page.screenshot({ path: 'scripts/shots/31-packaged-final.png' })
console.log('ERRORS:', errors)
await app.close()
