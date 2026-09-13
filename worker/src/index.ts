import Anthropic from '@anthropic-ai/sdk';
import {
  buildAnthropicRequestParams,
  checkAuth,
  parseAnthropicToolResult,
  parseRecognizeRequestBody,
  RecognizeRequestError,
} from './recognize';
import {
  buildAnthropicRequestParams as buildEstimateCarbsRequestParams,
  parseAnthropicToolResult as parseEstimateCarbsToolResult,
  parseEstimateCarbsRequestBody,
  EstimateCarbsRequestError,
} from './estimateCarbs';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_SHARED_SECRET: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function handleRecognize(request: Request, env: Env): Promise<Response> {
  let body;
  try {
    body = parseRecognizeRequestBody(await request.json());
  } catch (e) {
    const status = e instanceof RecognizeRequestError ? e.status : 400;
    return jsonResponse({ error: e instanceof Error ? e.message : 'Invalid request' }, status);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let message;
  try {
    message = await client.messages.create(buildAnthropicRequestParams(body));
  } catch (e) {
    console.error('Anthropic call failed:', e instanceof Error ? e.message : e, e instanceof Anthropic.APIError ? { status: e.status, name: e.name } : undefined);
    return jsonResponse({ error: 'Recognition request failed' }, 502);
  }

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return jsonResponse({ error: 'Model did not return a tool result' }, 502);
  }

  try {
    const result = parseAnthropicToolResult(toolUse.input, body.productNames);
    return jsonResponse(result, 200);
  } catch (e) {
    const status = e instanceof RecognizeRequestError ? e.status : 502;
    return jsonResponse({ error: e instanceof Error ? e.message : 'Invalid model response' }, status);
  }
}

async function handleEstimateCarbs(request: Request, env: Env): Promise<Response> {
  let body;
  try {
    body = parseEstimateCarbsRequestBody(await request.json());
  } catch (e) {
    const status = e instanceof EstimateCarbsRequestError ? e.status : 400;
    return jsonResponse({ error: e instanceof Error ? e.message : 'Invalid request' }, status);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let message;
  try {
    message = await client.messages.create(buildEstimateCarbsRequestParams(body));
  } catch (e) {
    console.error('Anthropic call failed:', e instanceof Error ? e.message : e, e instanceof Anthropic.APIError ? { status: e.status, name: e.name } : undefined);
    return jsonResponse({ error: 'Estimate request failed' }, 502);
  }

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return jsonResponse({ error: 'Model did not return a tool result' }, 502);
  }

  try {
    const result = parseEstimateCarbsToolResult(toolUse.input);
    return jsonResponse(result, 200);
  } catch (e) {
    const status = e instanceof EstimateCarbsRequestError ? e.status : 502;
    return jsonResponse({ error: e instanceof Error ? e.message : 'Invalid model response' }, status);
  }
}

const ROUTES: Record<string, ((request: Request, env: Env) => Promise<Response>) | undefined> = {
  '/recognize': handleRecognize,
  '/estimate-carbs': handleEstimateCarbs,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];

    if (request.method === 'OPTIONS' && handler) {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
      });
    }

    if (request.method !== 'POST' || !handler) {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    if (!checkAuth(request.headers.get('X-App-Secret'), env.APP_SHARED_SECRET)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    return handler(request, env);
  },
};
