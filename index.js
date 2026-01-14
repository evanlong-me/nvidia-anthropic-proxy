const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
        },
      });
    }

    // 可选认证
    if (env.AUTH_TOKEN) {
      const authHeader = request.headers.get('x-api-key') || request.headers.get('Authorization')?.replace('Bearer ', '');
      if (authHeader !== env.AUTH_TOKEN) {
        return jsonResponse({ error: { type: 'authentication_error', message: 'Invalid API key' } }, 401);
      }
    }

    // 路由
    if (url.pathname === '/v1/messages' && request.method === 'POST') {
      return handleMessages(request, env);
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResponse({ status: 'ok', service: 'nvidia-anthropic-proxy' });
    }

    return jsonResponse({ error: { type: 'not_found', message: 'Not found' } }, 404);
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleMessages(request, env) {
  try {
    const body = await request.json();
    const { model, messages, system, max_tokens, temperature, top_p, stream, stop_sequences } = body;

    if (!model) {
      return jsonResponse({ error: { type: 'invalid_request_error', message: 'model is required' } }, 400);
    }

    // 转换为 OpenAI 格式
    const openaiMessages = [];
    if (system) {
      openaiMessages.push({ role: 'system', content: system });
    }
    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: normalizeContent(msg.content),
      });
    }

    const openaiBody = {
      model,
      messages: openaiMessages,
      max_tokens,
      stream: !!stream,
    };
    if (temperature !== undefined) openaiBody.temperature = temperature;
    if (top_p !== undefined) openaiBody.top_p = top_p;
    if (stop_sequences) openaiBody.stop = stop_sequences;

    const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(openaiBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse({ error: { type: 'api_error', message: `Nvidia API error: ${response.status} - ${errorText}` } }, response.status);
    }

    if (stream) {
      return handleStream(response, model);
    }

    const data = await response.json();
    return jsonResponse(convertToAnthropic(data, model));
  } catch (err) {
    return jsonResponse({ error: { type: 'internal_error', message: err.message } }, 500);
  }
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  // 处理 content blocks
  return content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'image') {
      return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
    }
    return block;
  });
}

function convertToAnthropic(data, model) {
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';

  let stopReason = null;
  if (choice?.finish_reason === 'stop') stopReason = 'end_turn';
  else if (choice?.finish_reason === 'length') stopReason = 'max_tokens';

  return {
    id: data.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    },
  };
}

function handleStream(response, model) {
  const messageId = `msg_${Date.now()}`;
  const encoder = new TextEncoder();
  let outputTokens = 0;

  const enqueue = (controller, str) => controller.enqueue(encoder.encode(str));

  const stream = new TransformStream({
    start(controller) {
      enqueue(controller, `event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: { id: messageId, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      })}\n\n`);
      enqueue(controller, `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
    },
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const finishReason = parsed.choices?.[0]?.finish_reason;

          if (delta?.content) {
            enqueue(controller, `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta.content } })}\n\n`);
          }

          if (finishReason) {
            let stopReason = 'end_turn';
            if (finishReason === 'length') stopReason = 'max_tokens';

            enqueue(controller, `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
            enqueue(controller, `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`);
            enqueue(controller, `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
          }

          if (parsed.usage) {
            outputTokens = parsed.usage.completion_tokens || 0;
          }
        } catch {}
      }
    },
  });

  response.body.pipeTo(stream.writable);

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
