#!/bin/bash

echo "=== Nvidia Anthropic Proxy Setup ==="
echo

# 检查 npx
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js first."
    exit 1
fi

# 安装依赖
echo "Installing dependencies..."
npm install

echo

# 确保已登录 Cloudflare：pipe 给 wrangler 会让 stdin 变成非交互式，
# 此时若未登录就会强制要 CLOUDFLARE_API_TOKEN，所以先在这里登录
if ! npx wrangler whoami >/dev/null 2>&1; then
    echo "Cloudflare not logged in. Opening browser to login..."
    npx wrangler login
    echo
fi

# 配置 NVIDIA_API_KEY
echo "Enter your NVIDIA API Key:"
read -s NVIDIA_KEY
echo
echo "$NVIDIA_KEY" | npx wrangler secret put NVIDIA_API_KEY

# 配置 AUTH_TOKEN (可选)
echo
echo "Enter AUTH_TOKEN to protect your proxy (leave empty to skip):"
read -s AUTH_TOKEN
echo
if [ -n "$AUTH_TOKEN" ]; then
    echo "$AUTH_TOKEN" | npx wrangler secret put AUTH_TOKEN
    echo "AUTH_TOKEN configured."
else
    echo "Skipped AUTH_TOKEN."
fi

echo
echo "=== Setup complete! ==="
echo "Run 'npm run dev' to start local development"
echo "Run 'npm run deploy' to deploy to Cloudflare"
