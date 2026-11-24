# CloudReel

[中文](README.md) · [English](README_EN.md)

A cloud-only AI short-video studio for desktop: give it a topic, and it writes the narration, synthesizes the voice-over, matches stock footage, burns in subtitles and exports a finished vertical or landscape video. No local models required.

<p align="center">
  <img src="build/icon.png" width="128" alt="CloudReel" />
</p>

## Features

- **Four-step workflow**: script → voice-over → visuals → export, every step can be revisited and edited.
- **Two script sources**: generate with an LLM (topic + style + length), or paste a full script and split it into sentences without rewriting the text.
- **LLM providers**: Alibaba Cloud Bailian Token Plan / pay-as-you-go, DeepSeek, Kimi, Zhipu, SiliconFlow, plus any OpenAI-compatible endpoint (custom base URL and optional key for local gateways).
- **TTS providers**: Bailian Token Plan, Bailian qwen-tts, Aliyun NLS, OpenAI TTS, Azure and Tencent Cloud, with a searchable voice picker.
- **Stock footage**: Pexels, Pixabay or a local media folder, with portrait / landscape / square output.
- **Live preview**: phone-ratio preview of footage, subtitles and audio; videos play inline and images get a slow Ken Burns push to mimic the final render.
- **Rendering**: one-pass ffmpeg pipeline with an automatic low-memory fallback, resolution-aware ASS subtitles, transitions (including random per cut), BGM and customizable subtitle styling.
- **Project library**: drafts auto-save; every project keeps its render history.
- **Appearance**: dark / light / follow system.
- **Data safety**: API keys are encrypted at rest with Electron `safeStorage` (DPAPI on Windows, Keychain on macOS); project data stays on your machine.

## Stack

Electron 45 · electron-vite · Vite 7 · React 19 · TypeScript · ffmpeg-static

## Getting started

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Open Settings on first launch and configure your text-model and speech-service keys.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start in development mode |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Build main / preload / renderer bundles |
| `npm run dist:win` | Build a Windows NSIS installer (x64) |
| `npm run dist:win:dir` | Build the unpacked Windows app |
| `npm run dist:mac` | Build macOS DMG + ZIP (x64 / arm64) |
| `npm run dist:mac:dir` | Build the macOS `.app` bundle |
| `npm run icons` | Regenerate PNG / ICO / ICNS from `build/icon.svg` |

Artifacts are written to `release/`. Builds are unsigned, so the OS may show a security prompt on first launch. macOS targets can only be built on macOS.

## Layout

```
src/
  main/       Electron main process: IPC, settings, ffmpeg, render pipeline, provider clients
  preload/    contextBridge API exposed as window.cloudreel
  renderer/   React UI (studio / settings / library)
  shared/     Shared types, presets, voice catalogs
build/        Build resources such as icons
scripts/      Icon generation and end-to-end scripts
```

## Local data

- Windows: `%APPDATA%\cloudreel`
- macOS: `~/Library/Application Support/cloudreel`

Contains settings, encrypted keys, project drafts, cached media and render records. Exported video files are not removed on uninstall.

## License

Private project; no open-source license declared.