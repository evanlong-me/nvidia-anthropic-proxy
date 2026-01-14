# Nvidia Anthropic Proxy

Cloudflare Workers 代理服务，将 Anthropic API 格式转换为 Nvidia API（OpenAI 兼容格式）。

## 快速开始

```bash
# 配置 secrets 并安装依赖
npm run setup

# 本地开发
npm run dev

# 部署到 Cloudflare
npm run deploy
```

## API

### POST /v1/messages

兼容 Anthropic Messages API 格式。

```bash
curl https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_AUTH_TOKEN" \
  -d '{
    "model": "minimaxai/minimax-m2",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### GET /health

健康检查端点。

## 支持的模型

直接透传到 Nvidia NIM API，支持所有可用模型。查看完整列表：[build.nvidia.com/models](https://build.nvidia.com/models)

示例：
- `minimaxai/minimax-m2`
- `z-ai/glm4.7`

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| NVIDIA_API_KEY | 是 | Nvidia API 密钥 |
| AUTH_TOKEN | 否 | 保护代理的认证令牌 |

## License

MIT
