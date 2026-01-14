# NVIDIA Anthropic Proxy

Cloudflare Worker 代理，让 Claude Code 使用 NVIDIA NIM API 的模型。

## 为什么需要这个？

[Claude Code](https://claude.ai/code) 原生只支持 Anthropic API。本项目让你可以：

- 在 Claude Code 中使用 NVIDIA NIM 的开源模型（Llama、Minimax、GLM 等）
- 保持 Claude Code 完整体验，无缝切换模型
- 利用 Cloudflare 全球边缘网络，低延迟访问

## 工作原理

```
Claude Code (Anthropic 格式)
    ↓
本代理 (Cloudflare Worker)
    ↓
格式转换 (Anthropic → OpenAI)
    ↓
NVIDIA NIM API
```

## 快速开始

### 1. 部署代理

```bash
git clone https://github.com/evanlong-me/nvidia-anthropic-proxy.git
cd nvidia-anthropic-proxy
npm run setup
npm run deploy
```

Setup 会提示输入：
- **Cloudflare Account ID** - [Cloudflare Dashboard](https://dash.cloudflare.com) 右侧栏
- **NVIDIA API Key** - [build.nvidia.com](https://build.nvidia.com)
- **AUTH_TOKEN**（可选）- 自定义密码，保护代理

部署成功后会显示 Worker 地址：`https://nvidia-anthropic-proxy.xxx.workers.dev`

### 2. 配置 Claude Code

编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://nvidia-anthropic-proxy.xxx.workers.dev",
    "ANTHROPIC_API_KEY": "你的AUTH_TOKEN",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "minimaxai/minimax-m2.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "minimaxai/minimax-m2.1",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "z-ai/glm4.7"
  }
}
```

### 3. 开始使用

```bash
claude
```

- `/model opus` → minimaxai/minimax-m2.1
- `/model sonnet` → minimaxai/minimax-m2.1
- `/model haiku` → z-ai/glm4.7

## 支持的模型

代理透传模式，支持 NVIDIA NIM 所有模型：

| 模型 | 说明 |
|------|------|
| `minimaxai/minimax-m2.1` | Minimax 最新模型，中文能力强 |
| `z-ai/glm4.7` | 智谱 GLM4，快速响应 |
| `meta/llama-3.3-70b-instruct` | Meta Llama 3.3 70B |
| `meta/llama-3.1-405b-instruct` | Meta Llama 3.1 405B |
| `deepseek-ai/deepseek-r1` | DeepSeek R1 推理模型 |
| `qwen/qwen2.5-72b-instruct` | 阿里通义千问 2.5 |

完整列表：[build.nvidia.com/models](https://build.nvidia.com/models)

## 环境变量

### Cloudflare Secrets

| 变量 | 必需 | 说明 |
|------|------|------|
| `NVIDIA_API_KEY` | 是 | NVIDIA NIM API 密钥 |
| `AUTH_TOKEN` | 否 | 代理访问令牌 |

### Claude Code

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_BASE_URL` | 代理地址 |
| `ANTHROPIC_API_KEY` | 对应 AUTH_TOKEN |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `/model opus` 使用的模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `/model sonnet` 使用的模型 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `/model haiku` 使用的模型 |

## 本地开发

```bash
npm run dev   # 启动本地服务器
npm run tail  # 查看实时日志
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/messages` | POST | 消息对话 |
| `/v1/models` | GET | 模型列表 |
| `/health` | GET | 健康检查 |

## 许可证

MIT
