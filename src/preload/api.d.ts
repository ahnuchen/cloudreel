import type { CloudReelApi } from './index'

declare global {
  interface Window {
    cloudreel: CloudReelApi
  }
}

export {}