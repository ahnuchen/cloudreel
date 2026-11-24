import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron'
import { existsSync } from 'fs'
import { extname, join } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'

const MEDIA_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.jpg', '.jpeg', '.png', '.webp', '.gif'])

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'crfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0c0f',
    autoHideMenuBar: true,
    title: 'CloudReel · 云剪',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerMediaProtocol(): void {
  protocol.handle('crfile', (request) => {
    try {
      const url = new URL(request.url)
      const encoded = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const filePath = Buffer.from(encoded, 'base64url').toString('utf8')
      if (!existsSync(filePath) || !MEDIA_EXT.has(extname(filePath).toLowerCase())) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}

// 与开发版共用同一份数据目录（设置、作品库），避免打包后配置丢失
app.setPath('userData', join(app.getPath('appData'), 'cloudreel'))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    app.setAppUserModelId('com.cloudreel.app')
    registerMediaProtocol()
    registerIpc(() => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}