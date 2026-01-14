const API_BASE = 'https://integrate.api.nvidia.com/v1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
        },
      });
    }

    if (env.AUTH_TOKEN) {
      const auth = request.headers.get('x-api-key') || request.headers.get('Authorization')?.replace('Bearer ', '');
      if (auth !== env.AUTH_TOKEN) {
        return json({ error: { type: 'authentication_error', message: 'Invalid API key' } }, 401);
      }
    }

    if (url.pathname === '/v1/messages' && request.method === 'POST') {
      return handleMessages(request, env);
    }
    if (url.pathname === '/v1/models' && request.method === 'GET') {
      return handleModels();
    }
    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ status: 'ok' });
    }

    return json({ error: { type: 'not_found', message: 'Not found' } }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function handleModels() {
  return json({ data: [], has_more: false, first_id: null, last_id: null });
}

async function handleMessages(request, env) {
  try {
    const body = await request.json();
    if (!body.model) {
      return json({ error: { type: 'invalid_request_error', message: 'model is required' } }, 400);
    }

    const messages = [];
    // Handle system prompt (can be string or array of TextBlocks)
    if (body.system) {
      const systemContent = typeof body.system === 'string'
        ? body.system
        : body.system.map(b => b.text).join('\n');
      messages.push({ role: 'system', content: systemContent });
    }
    for (const msg of body.messages) {
      const converted = convertMessage(msg);
      if (Array.isArray(converted)) {
        messages.push(...converted);
      } else {
        messages.push(converted);
      }
    }

    const payload = {
      model: body.model,
      messages,
      max_tokens: body.max_tokens,
      stream: !!body.stream,
    };
    if (body.temperature !== undefined) payload.temperature = body.temperature;
    if (body.top_p !== undefined) payload.top_p = body.top_p;
    if (body.stop_sequences) payload.stop = body.stop_sequences;

    // Convert Anthropic tools to OpenAI format
    if (body.tools?.length) {
      payload.tools = body.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || { type: 'object', properties: {} },
        },
      }));
    }

    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return json({ error: { type: 'api_error', message: await res.text() } }, res.status);

    if (body.stream) return handleStream(res, body.model);

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Build response content
    const content = [];

    // Handle thinking/reasoning content (e.g., DeepSeek R1)
    if (message?.reasoning_content) {
      content.push({ type: 'thinking', thinking: message.reasoning_content });
    }

    if (message?.content) {
      content.push({ type: 'text', text: message.content });
    }

    // Convert OpenAI tool_calls to Anthropic tool_use
    if (message?.tool_calls?.length) {
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }

    // Determine stop reason
    let stop_reason = 'end_turn';
    if (choice?.finish_reason === 'length') stop_reason = 'max_tokens';
    if (choice?.finish_reason === 'tool_calls') stop_reason = 'tool_use';
    if (message?.tool_calls?.length) stop_reason = 'tool_use';

    return json({
      id: data.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: content.length ? content : [{ type: 'text', text: '' }],
      model: body.model,
      stop_reason,
      stop_sequence: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    });
  } catch (err) {
    return json({ error: { type: 'internal_error', message: err.message } }, 500);
  }
}

// Convert Anthropic message to OpenAI format (may return array for tool_result)
function convertMessage(msg) {
  const content = msg.content;

  // Simple string content
  if (typeof content === 'string') {
    return { role: msg.role, content };
  }

  // Array content - check for tool_use, tool_result, etc.
  const textParts = [];
  const toolCalls = [];
  const toolResults = [];

  for (const block of content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      // Assistant's tool call
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
      });
    } else if (block.type === 'tool_result') {
      // User's tool result
      let resultContent = '';
      if (typeof block.content === 'string') {
        resultContent = block.content;
      } else if (Array.isArray(block.content)) {
        resultContent = block.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
      }
      toolResults.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: resultContent,
      });
    } else if (block.type === 'image') {
      textParts.push({ type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
    }
  }

  // If message contains tool_results, return them as separate messages
  if (toolResults.length > 0) {
    return toolResults;
  }

  // If assistant message with tool_calls
  if (msg.role === 'assistant' && toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: textParts.join('') || null,
      tool_calls: toolCalls,
    };
  }

  // Regular message with text/image content
  if (textParts.every(p => typeof p === 'string')) {
    return { role: msg.role, content: textParts.join('') };
  }

  // Mixed content (text + images)
  return { role: msg.role, content: textParts };
}

function handleStream(response, model) {
  const id = `msg_${Date.now()}`;
  const enc = new TextEncoder();
  let tokens = 0;
  let contentIndex = 0;
  let hasThinkingBlock = false;
  let hasTextBlock = false;
  const toolCalls = {}; // Track tool calls by index

  const readable = new ReadableStream({
    async start(ctrl) {
      const send = (event, data) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send('message_start', {
        type: 'message_start',
        message: { id, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      });

      const es = EventSource.from(response.body);
      es.onmessage = (e) => {
        if (e.data === '[DONE]') return;
        try {
          const parsed = JSON.parse(e.data);
          const delta = parsed.choices?.[0]?.delta;
          const finish = parsed.choices?.[0]?.finish_reason;

          // Handle thinking/reasoning content (e.g., DeepSeek R1)
          if (delta?.reasoning_content) {
            if (!hasThinkingBlock) {
              send('content_block_start', { type: 'content_block_start', index: contentIndex, content_block: { type: 'thinking', thinking: '' } });
              hasThinkingBlock = true;
            }
            send('content_block_delta', { type: 'content_block_delta', index: contentIndex, delta: { type: 'thinking_delta', thinking: delta.reasoning_content } });
          }

          // Handle text content
          if (delta?.content) {
            // Close thinking block if transitioning to text
            if (hasThinkingBlock && !hasTextBlock) {
              send('content_block_stop', { type: 'content_block_stop', index: contentIndex });
              contentIndex++;
              hasThinkingBlock = false;
            }
            if (!hasTextBlock) {
              send('content_block_start', { type: 'content_block_start', index: contentIndex, content_block: { type: 'text', text: '' } });
              hasTextBlock = true;
            }
            send('content_block_delta', { type: 'content_block_delta', index: contentIndex, delta: { type: 'text_delta', text: delta.content } });
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                // Close text block if open
                if (hasTextBlock) {
                  send('content_block_stop', { type: 'content_block_stop', index: contentIndex });
                  contentIndex++;
                  hasTextBlock = false;
                }
                // Start new tool_use block
                toolCalls[idx] = { id: tc.id, name: tc.function?.name || '', arguments: '' };
                send('content_block_start', {
                  type: 'content_block_start',
                  index: contentIndex + idx,
                  content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name || '', input: {} },
                });
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) {
                toolCalls[idx].arguments += tc.function.arguments;
                send('content_block_delta', {
                  type: 'content_block_delta',
                  index: contentIndex + idx,
                  delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
                });
              }
            }
          }

          if (finish) {
            // Close any open blocks
            if (hasThinkingBlock) {
              send('content_block_stop', { type: 'content_block_stop', index: contentIndex });
              contentIndex++;
            }
            if (hasTextBlock) {
              send('content_block_stop', { type: 'content_block_stop', index: contentIndex });
              contentIndex++;
            }
            for (const idx of Object.keys(toolCalls)) {
              send('content_block_stop', { type: 'content_block_stop', index: contentIndex + parseInt(idx) });
            }

            // Determine stop reason
            let stop_reason = 'end_turn';
            if (finish === 'length') stop_reason = 'max_tokens';
            if (finish === 'tool_calls' || Object.keys(toolCalls).length > 0) stop_reason = 'tool_use';

            send('message_delta', { type: 'message_delta', delta: { stop_reason }, usage: { output_tokens: tokens } });
            send('message_stop', { type: 'message_stop' });
            ctrl.close();
          }
          if (parsed.usage) tokens = parsed.usage.completion_tokens || 0;
        } catch {}
      };
      es.onerror = () => ctrl.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
  });
}
