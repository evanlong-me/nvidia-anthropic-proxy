# NVIDIA Anthropic Proxy

一个轻量级 Cloudflare Worker 代理，让你在 Claude Code 中使用 NVIDIA NIM API 的模型。

## 为什么需要这个？

[Claude Code](https://claude.ai/code) 是 Anthropic 官方的 AI 编程助手 CLI，原生只支持 Anthropic API。本项目让你可以：

- 在 Claude Code 中使用 NVIDIA NIM 提供的开源模型（如 Llama、Minimax、GLM 等）
- 保持 Claude Code 的完整体验，无缝切换模型
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

### 1. 获取 API Key

前往 [build.nvidia.com](https://build.nvidia.com/models) 注册并获取 NVIDIA API Key。

### 2. 部署代理

```bash
# 克隆项目
git clone https://github.com/你的用户名/nvidia-anthropic-proxy.git
cd nvidia-anthropic-proxy

# 安装依赖并配置
npm run setup
```

Setup 会提示你输入：
- **Cloudflare Account ID** - 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 右侧栏查看
- **NVIDIA API Key** - 在 [build.nvidia.com](https://build.nvidia.com) 获取
- **AUTH_TOKEN**（可选）- 自定义密码，保护代理

```bash
# 部署到 Cloudflare
npm run deploy
```

部署成功后会显示你的 Worker 地址，类似：`https://nvidia-anthropic-proxy.你的用户名.workers.dev`

### 3. 配置 Claude Code

编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://nvidia-anthropic-proxy.你的用户名.workers.dev",
    "ANTHROPIC_API_KEY": "你的AUTH_TOKEN",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "minimaxai/minimax-m2.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "minimaxai/minimax-m2.1",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "z-ai/glm4.7"
  }
}
```

### 4. 开始使用

```bash
claude
```

在 Claude Code 中：
- `/model opus` → 使用 minimaxai/minimax-m2.1
- `/model sonnet` → 使用 minimaxai/minimax-m2.1
- `/model haiku` → 使用 z-ai/glm4.7

## 支持的模型

代理采用透传模式，支持 NVIDIA NIM 上的所有模型。常用模型：

| 模型 | 说明 |
|------|------|
| `minimaxai/minimax-m2.1` | Minimax 最新模型，中文能力强 |
| `z-ai/glm4.7` | 智谱 GLM4，快速响应 |
| `meta/llama-3.3-70b-instruct` | Meta Llama 3.3 70B |
| `meta/llama-3.1-405b-instruct` | Meta Llama 3.1 405B |
| `deepseek-ai/deepseek-r1` | DeepSeek R1 推理模型 |
| `qwen/qwen2.5-72b-instruct` | 阿里通义千问 2.5 |

完整模型列表：[build.nvidia.com/models](https://build.nvidia.com/models)

## 环境变量

### Cloudflare Secrets（部署时配置）

| 变量 | 必需 | 说明 |
|------|------|------|
| `NVIDIA_API_KEY` | 是 | NVIDIA NIM API 密钥 |
| `AUTH_TOKEN` | 否 | 代理访问令牌，保护你的代理不被滥用 |

### Claude Code 环境变量

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_BASE_URL` | 代理地址 |
| `ANTHROPIC_API_KEY` | 对应代理的 AUTH_TOKEN |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | /model opus 使用的模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | /model sonnet 使用的模型 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | /model haiku 使用的模型 |

## 本地开发

```bash
# 启动本地开发服务器
npm run dev

# 查看实时日志
npm run tail
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/messages` | POST | 消息对话（Anthropic 格式） |
| `/v1/models` | GET | 模型列表 |
| `/health` | GET | 健康检查 |

## 许可证

MIT
