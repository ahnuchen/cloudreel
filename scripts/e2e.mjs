import { _electron as electron } from 'playwright'
import path from 'path'
import { existsSync } from 'fs'

const app = await electron.launch({ args: [path.resolve('.')], env: { ...process.env }, timeout: 60000 })
const page = await app.firstWindow({ timeout: 60000 })
page.setDefaultTimeout(120000)
const errors = []
const toasts = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(1200)

async function waitFor(label, fn, timeout = 300000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const ok = await fn()
      if (ok) return true
    } catch {
      /* keep waiting */
    }
    await page.waitForTimeout(800)
  }
  throw new Error('TIMEOUT: ' + label)
}

async function snapshotToasts() {
  const texts = await page.locator('.toast-text').allInnerTexts().catch(() => [])
  for (const t of texts) if (!toasts.includes(t)) toasts.push(t)
}

// clean local draft only (keep settings)
await page.evaluate(() => localStorage.removeItem('cloudreel.studio.v1'))
await page.reload()
await page.waitForTimeout(1500)

await page.getByPlaceholder(/隔夜菜/).fill('为什么熬夜之后反而更清醒？')
await page.locator('select').nth(1).selectOption('60')
await page.getByRole('button', { name: /生成口播稿/ }).click()

await waitFor('script generated', async () => (await page.locator('.script-row').count()) > 0 || (await page.locator('.toast-error').count()) > 0)
await page.waitForTimeout(500)
await snapshotToasts()
console.log('TOASTS AFTER GENERATE:', JSON.stringify(toasts, null, 2))
const lineCount = await page.locator('.script-row').count()
console.log('LINES:', lineCount)
console.log('SCRIPT:', (await page.locator('.card').nth(1).innerText()).slice(0, 600))
await page.screenshot({ path: 'scripts/shots/10-script.png' })
if (!lineCount) throw new Error('script generation failed')

await page.getByRole('button', { name: '下一步：配音' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /生成全部配音|补齐 \d+ 句配音/ }).click()
await waitFor('voice generated', async () => await page.getByRole('button', { name: '下一步：画面' }).isEnabled(), 600000)
await snapshotToasts()
await page.screenshot({ path: 'scripts/shots/11-voice.png' })
console.log('VOICE DONE')

await page.getByRole('button', { name: '下一步：画面' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: '自动匹配全部' }).click()
await waitFor(
  'materials matched',
  async () => {
    const txt = await page.locator('.action-info').first().innerText()
    const m = txt.match(/已匹配\s*(\d+)\s*\/\s*(\d+)/)
    if (m && Number(m[1]) >= Number(m[2]) && Number(m[2]) > 0) return true
    return (await page.locator('.toast-error').count()) > 0
  },
  300000
)
await snapshotToasts()
await page.screenshot({ path: 'scripts/shots/12-visual.png', fullPage: false })
console.log('MATCH DONE')

await page.getByRole('button', { name: '下一步：成片' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'scripts/shots/13-finish.png' })
await page.getByRole('button', { name: '开始渲染成片' }).click()

await waitFor(
  'render done',
  async () =>
    (await page.locator('.result-video').count()) > 0 ||
    (await page.locator('.banner.warn').count()) > 0,
  900000
)
await snapshotToasts()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'scripts/shots/14-result.png' })

const resultPath = await page.locator('.path-box span').first().innerText().catch(() => '')
console.log('RESULT PATH:', resultPath)
console.log('EXISTS:', resultPath ? existsSync(resultPath) : false)

await page.getByRole('button', { name: '作品库', exact: false }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/shots/15-library.png' })
const projects = await page.evaluate(() => window.cloudreel.projectsList())
console.log('LIBRARY:', JSON.stringify(projects.map((p) => ({ title: p.title, lines: p.lines, outputs: p.outputs, poster: !!p.poster, cover: p.cover?.slice(0, 60) })), null, 2))
console.log('TOASTS:', JSON.stringify(toasts, null, 2))
console.log('ERRORS:', JSON.stringify(errors, null, 2))
await app.close()