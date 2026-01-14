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

# 配置 Cloudflare Account ID
echo "Enter your Cloudflare Account ID:"
read ACCOUNT_ID
if [ -n "$ACCOUNT_ID" ]; then
    # 更新 wrangler.toml
    if grep -q "account_id" wrangler.toml; then
        sed -i '' "s/account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
    else
        echo "account_id = \"$ACCOUNT_ID\"" >> wrangler.toml
    fi
    echo "Account ID configured."
fi

echo

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
