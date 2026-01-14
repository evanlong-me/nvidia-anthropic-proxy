# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Cloudflare Worker 代理，让 OpenAI 兼容 API（如 NVIDIA NIM）支持 Anthropic API 格式。

## 命令

```bash
npm run setup    # 配置 secrets 和安装依赖
npm run dev      # 本地开发
npm run deploy   # 部署到 Cloudflare
```

## 架构

单文件 Worker (`index.js`)，转换 Anthropic ↔ OpenAI 格式：

- `POST /v1/messages` → `/chat/completions`
- `GET /v1/models` → `/models`
- `GET /health`

## 环境变量

- `NVIDIA_API_KEY` - 必需
- `AUTH_TOKEN` - 可选，代理认证
