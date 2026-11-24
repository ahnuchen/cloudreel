# CloudReel

[中文](README.md) · [English](README_EN.md)

云端 AI 短视频成片工作台：输入一个主题，自动生成口播稿、合成配音、匹配画面、烧录字幕，一键导出竖屏/横屏成片。全部走云服务，本机不需要安装任何模型。

<p align="center">
  <img src="build/icon.png" width="128" alt="CloudReel" />
</p>

## 功能

- **四步成片**：文案脚本 → 配音 → 画面素材 → 成片导出，每一步都可回退修改。
- **两种文案来源**：AI 生成（主题 + 风格 + 篇幅），或直接粘贴全文按原句拆分，不改写内容。
- **文本模型**：内置阿里云百炼 Token 套餐 / 按量付费、DeepSeek、Kimi、智谱、硅基流动，也支持任意 OpenAI 兼容接口（自定义 Base URL 与 Key，本地网关可留空 Key）。
- **语音合成**：百炼 Token 套餐、百炼 qwen-tts、阿里云智能语音 NLS、OpenAI TTS、Azure、腾讯云，音色列表可搜索。
- **画面素材**：Pexels、Pixabay 按句检索视频/图片，或使用本地素材文件夹；支持竖屏、横屏、方形。
- **实时预览**：手机比例预览画面、字幕与配音，视频直接播放，图片用缓慢推拉模拟成片的 Ken Burns 效果。
- **成片渲染**：ffmpeg 一次合成（内存紧张时自动切换低内存逐段合成），ASS 字幕按分辨率等比缩放，支持转场（含随机转场）、BGM、字幕样式自定义。
- **项目管理**：草稿自动保存，作品库保留历史项目与多条成片记录。
- **外观**：深色 / 浅色 / 跟随系统。
- **数据安全**：API Key 使用 Electron `safeStorage` 加密落盘（Windows DPAPI / macOS Keychain），项目数据只保存在本机。

## 技术栈

Electron 45 · electron-vite · Vite 7 · React 19 · TypeScript · ffmpeg-static

## 快速开始

要求 Node.js 22+。

```bash
npm install
npm run dev
```

首次启动后到「设置」里配置文本模型和语音服务的 Key。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式启动 |
| `npm run typecheck` | 类型检查 |
| `npm run build` | 构建主进程 / preload / 渲染层 |
| `npm run dist:win` | 打 Windows NSIS 安装包（x64） |
| `npm run dist:win:dir` | 打 Windows 免安装目录 |
| `npm run dist:mac` | 打 macOS DMG + ZIP（x64 / arm64） |
| `npm run dist:mac:dir` | 打 macOS `.app` 目录 |
| `npm run icons` | 从 `build/icon.svg` 重新生成 PNG / ICO / ICNS |

产物输出到 `release/`。安装包未做代码签名，首次运行可能触发系统安全提示；macOS 目标只能在 macOS 上构建。

## 目录结构

```
src/
  main/       Electron 主进程：IPC、设置、ffmpeg、渲染流水线、云服务适配
  preload/    contextBridge 暴露的 window.cloudreel API
  renderer/   React 界面（studio / settings / library）
  shared/     共享类型、预设、音色表
build/        图标等打包资源
scripts/      图标生成、端到端脚本
```

## 本机数据

- Windows：`%APPDATA%\cloudreel`
- macOS：`~/Library/Application Support/cloudreel`

包含设置、加密后的 Key、项目草稿、素材缓存与成片记录；已导出的成片文件不受卸载影响。

## 许可

目前为私有项目，未声明开源许可证。