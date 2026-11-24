import { useState, type ReactElement } from 'react'
import type { LineMaterial, MaterialCandidate } from '@shared/types'
import { mediaUrl } from '../lib/api'
import { cn } from '../lib/api'

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

export function MaterialMedia({
  material,
  className,
  animateImage = false
}: {
  material: LineMaterial | MaterialCandidate | null
  className?: string
  animateImage?: boolean
}): ReactElement | null {
  const [failed, setFailed] = useState(false)
  if (!material) return null
  if (failed) {
    return <div className={cn('phone-bg', className)} style={{ background: 'linear-gradient(145deg,#1d2028,#0c0d11)' }} />
  }
  const imageClass = animateImage ? cn(className, 'phone-kenburns') : className

  if ('kind' in material && material.kind === 'local') {
    const src = mediaUrl(material.path)
    if (isVideoUrl(material.path)) {
      return (
        <video
          className={className}
          src={src}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )
    }
    return <img className={imageClass} src={src} alt="" onError={() => setFailed(true)} />
  }

  const candidate = material as MaterialCandidate
  if (candidate.kind === 'video') {
    const src = isVideoUrl(candidate.previewUrl) ? candidate.previewUrl : candidate.url
    return (
      <video
        className={className}
        src={src}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        onError={() => setFailed(true)}
      />
    )
  }
  const img = candidate.previewUrl || candidate.url
  return <img className={imageClass} src={img} alt="" onError={() => setFailed(true)} />
}