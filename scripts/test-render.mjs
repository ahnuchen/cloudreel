import { _electron as electron } from 'playwright'
import path from 'path'
import { existsSync } from 'fs'

const app = await electron.launch({ args: [path.resolve('.')], env: { ...process.env }, timeout: 60000 })
const page = await app.firstWindow({ timeout: 60000 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(1500)

await page.getByRole('button', { name: '作品库', exact: false }).first().click()
await page.waitForTimeout(1200)
const firstOutputBtn = page.getByRole('button', { name: /^成片 1$/ }).first()
if (await firstOutputBtn.count()) {
  await firstOutputBtn.click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'scripts/shots/16-library-modal.png' })
  await page.keyboard.press('Escape')
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(400)
}

const out = await page.evaluate(async () => {
  const list = await window.cloudreel.projectsList()
  const target = list.find((p) => p.outputs > 0) ?? list[0]
  const rec = await window.cloudreel.projectLoad(target.id)
  const s = await window.cloudreel.getSettings()
  const d = rec.draft
  const lines = d.script.lines
  const cfg = {
    projectId: rec.id,
    title: d.script.title,
    lines: lines.map((l) => ({ id: l.id, text: l.text, material: d.material[l.id] || null })),
    orientation: d.videoPreset,
    width: s.defaults.width,
    height: s.defaults.height,
    fps: 25,
    transition: { enabled: true, type: 'fade', duration: 0.6 },
    subtitles: {
      enabled: true,
      fontName: s.defaults.subtitleFont,
      fontSize: s.defaults.subtitleFontSize,
      color: s.defaults.subtitleColor,
      outlineColor: s.defaults.subtitleOutlineColor,
      outline: s.defaults.subtitleOutline,
      alignment: s.defaults.subtitleAlignment
    },
    bgm: { path: s.defaults.bgmPath, volume: s.defaults.bgmVolume },
    voice: d.voiceMeta || { provider: s.tts.provider, voice: '', speed: 1 },
    outputName: 'onepass-' + Date.now(),
    outputDir: s.defaults.outputDir
  }
  const progress = []
  const off = window.cloudreel.onRenderProgress((p) => progress.push({ step: p.step, percent: p.percent }))
  const res = await window.cloudreel.startRender(cfg)
  off()
  return { res, first: progress.slice(0, 6), last: progress.slice(-4) }
})

console.log('ONEPASS:', JSON.stringify(out, null, 2))
console.log('EXISTS:', out.res.videoPath ? existsSync(out.res.videoPath) : false)
console.log('ERRORS:', errors)
await app.close()
