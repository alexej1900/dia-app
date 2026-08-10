# Dish Photo Recognition Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Module 2 of DIA-APP: let the user photograph a dish, have a Cloudflare Worker call Claude's vision API to identify ingredients and match them against the local product catalog, and let the user review and add the results to a dish.

**Architecture:** `DishFormScreen` gains a "Recognize from photo" control (`PhotoRecognitionButton`) that picks/resizes a photo client-side and POSTs it to a Cloudflare Worker (`worker/`), which forwards it to Claude (model `claude-haiku-4-5`) with a forced tool call that both identifies ingredients and matches them against the caller's product names. The app shows results on a new `PhotoReviewScreen` (checkbox list); confirmed matched items are added as ingredients directly, confirmed unmatched items are routed one at a time through the existing `ProductFormScreen` (extended to accept a prefilled name and a creation callback).

**Tech Stack:** Expo SDK 57 / React Native / TypeScript (client, unchanged from Module 1), `expo-image-picker` + `expo-image-manipulator` (new), Cloudflare Workers + `@anthropic-ai/sdk` (new, separate `worker/` npm project), Jest for client tests (existing), Vitest for worker tests (new).

## Global Constraints

- All files, code, comments, and docs in this repository are written in English (project convention).
- Git commits in this repository never include a `Co-Authored-By` trailer (project convention).
- Design spec: `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md`. Follow it for scope boundaries — this module only identifies *which* ingredients are present; it does not estimate quantity (Module 3's job). Added ingredients get a blank `gramsText`, exactly like manual add today.
- Vision model is `claude-haiku-4-5` (confirmed with the user — cost-optimized over `claude-opus-5` for this bounded classification task).
- The Anthropic API key lives only as a Cloudflare Worker secret (`ANTHROPIC_API_KEY`, set via `wrangler secret put`) — never in client code or committed files.
- The app authenticates to the Worker with a static shared-secret header (`X-App-Secret`), read from `EXPO_PUBLIC_RECOGNITION_API_SECRET`. This is a deterrent against casual abuse of the Anthropic quota, not a strong security boundary (per design spec) — an `EXPO_PUBLIC_` variable is compiled into the client bundle in plain text, same as any client-embedded secret.
- Client-side config (`EXPO_PUBLIC_RECOGNITION_API_URL`, `EXPO_PUBLIC_RECOGNITION_API_SECRET`) is read via `process.env.EXPO_PUBLIC_*` (Expo's built-in `.env` support) — no `expo-constants` dependency needed. Real values live in a gitignored `.env`; `.env.example` documents the shape and is committed.
- The Cloudflare Worker (`worker/`) is a separate npm project from the Expo app — it is not part of the app's dependency tree or bundle, and has its own `package.json`, `tsconfig.json`, and test suite (Vitest, since Cloudflare's own tooling favors it over Jest for Workers).
- No Android SDK/emulator exists in this dev environment and native camera capture cannot be exercised here. Only the gallery-picker path is verified in this session, via `expo start --web` + chrome-devtools MCP (the same approach used for Module 1). Camera capture is a known, non-blocking open caveat, same as Module 1's native-only behaviors.
- Repo root: `D:\РАЗРАБОТКА\DIA-APP` (Windows path `D:/РАЗРАБОТКА/DIA-APP` in Git Bash).

---

## Task 1: Client dependencies and config plumbing

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install`)
- Modify: `app.json` (add `expo-image-picker` config plugin)
- Modify: `.gitignore` (ignore `.env`)
- Create: `.env.example`

**Interfaces:**
- Produces: `EXPO_PUBLIC_RECOGNITION_API_URL` and `EXPO_PUBLIC_RECOGNITION_API_SECRET` as the two env vars every later client task reads via `process.env.EXPO_PUBLIC_*`.

- [ ] **Step 1: Install the picker and manipulator packages at the SDK 57-compatible versions**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP" && npx expo install expo-image-picker expo-image-manipulator
```

- [ ] **Step 2: Add the image-picker config plugin to `app.json`**

Add a `"plugins"` array (this app has none yet) so the Android manifest gets the right permission strings:

```json
{
  "expo": {
    "name": "DIA-APP",
    "slug": "dia-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "package": "com.diaapp.mobile",
      "adaptiveIcon": {
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow $(PRODUCT_NAME) to access your photos to recognize dish ingredients.",
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to photograph a dish.",
          "microphonePermission": false
        }
      ]
    ]
  }
}
```

- [ ] **Step 3: Ignore the real `.env`, commit an example**

Add to `.gitignore` (after the existing `# local env files` section):

```
.env
```

Create `.env.example`:

```
# Cloudflare Worker endpoint that proxies dish-photo recognition to Claude.
# See worker/README instructions (Task 4) for deploying the Worker and getting these values.
EXPO_PUBLIC_RECOGNITION_API_URL=https://your-worker.your-subdomain.workers.dev/recognize
EXPO_PUBLIC_RECOGNITION_API_SECRET=replace-with-the-secret-you-set-as-APP_SHARED_SECRET-on-the-worker
```

- [ ] **Step 4: Verify nothing broke**

```bash
npx tsc --noEmit
```

Expected: passes with no errors (no code references the new packages yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json .gitignore .env.example
git commit -m "chore: add image picker/manipulator deps and recognition API env config"
```

---

## Task 2: Scaffold the Cloudflare Worker project

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.jsonc`, `worker/.gitignore`, `worker/src/index.ts` (placeholder)

**Interfaces:**
- Produces: a `worker/` npm project with `@anthropic-ai/sdk` as a dependency and `wrangler`/`typescript`/`vitest`/`@cloudflare/workers-types` as dev dependencies, ready for Task 3 to add real logic.

- [ ] **Step 1: Create the directory and initialize npm**

```bash
mkdir "D:/РАЗРАБОТКА/DIA-APP/worker"
cd "D:/РАЗРАБОТКА/DIA-APP/worker" && npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker"
npm install @anthropic-ai/sdk
npm install --save-dev wrangler typescript vitest @cloudflare/workers-types
```

- [ ] **Step 3: Replace the generated `package.json` scripts section**

Edit `worker/package.json` (keep the `name`/`dependencies`/`devDependencies` npm just generated, replace only `"main"` and `"scripts"`):

```json
{
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2021",
    "lib": ["es2021"],
    "module": "es2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Create `worker/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "dia-app-dish-recognition",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-08",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 6: Create `worker/.gitignore`**

```
node_modules/
.wrangler/
.dev.vars
```

- [ ] **Step 7: Create a placeholder `worker/src/index.ts`** (Task 4 replaces this)

```typescript
export default {
  async fetch(): Promise<Response> {
    return new Response('Not implemented yet', { status: 501 });
  },
};
```

- [ ] **Step 8: Verify the project compiles**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker" && npx tsc --noEmit
```

Expected: passes with no errors.

- [ ] **Step 9: Commit**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP"
git add worker/package.json worker/package-lock.json worker/tsconfig.json worker/wrangler.jsonc worker/.gitignore worker/src/index.ts
git commit -m "chore: scaffold Cloudflare Worker project for dish recognition"
```

---

## Task 3: Worker recognition logic (pure functions, TDD)

**Files:**
- Create: `worker/src/recognize.ts`
- Test: `worker/src/recognize.test.ts`

**Interfaces:**
- Produces: `RecognizeRequestBody`, `RecognizedItem`, `RecognizeRequestError`, `parseRecognizeRequestBody(body: unknown): RecognizeRequestBody`, `checkAuth(provided: string | null, expected: string): boolean`, `buildAnthropicRequestParams(body: RecognizeRequestBody)`, `parseAnthropicToolResult(input: unknown): RecognizedItem[]` — all consumed by Task 4's `index.ts`.

- [ ] **Step 1: Write the failing tests**

Create `worker/src/recognize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildAnthropicRequestParams,
  checkAuth,
  parseAnthropicToolResult,
  parseRecognizeRequestBody,
  RecognizeRequestError,
} from './recognize';

describe('checkAuth', () => {
  it('returns true when the provided secret matches', () => {
    expect(checkAuth('shh', 'shh')).toBe(true);
  });

  it('returns false when the header is missing', () => {
    expect(checkAuth(null, 'shh')).toBe(false);
  });

  it('returns false when the secret does not match', () => {
    expect(checkAuth('wrong', 'shh')).toBe(false);
  });
});

describe('parseRecognizeRequestBody', () => {
  it('accepts a valid body', () => {
    const body = parseRecognizeRequestBody({ image: 'abc', productNames: ['Rice'] });
    expect(body).toEqual({ image: 'abc', productNames: ['Rice'] });
  });

  it('rejects a missing image', () => {
    expect(() => parseRecognizeRequestBody({ productNames: [] })).toThrow(RecognizeRequestError);
  });

  it('rejects an empty-string image', () => {
    expect(() => parseRecognizeRequestBody({ image: '', productNames: [] })).toThrow(RecognizeRequestError);
  });

  it('rejects non-string productNames entries', () => {
    expect(() => parseRecognizeRequestBody({ image: 'abc', productNames: [1] })).toThrow(RecognizeRequestError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseRecognizeRequestBody('nope')).toThrow(RecognizeRequestError);
  });
});

describe('buildAnthropicRequestParams', () => {
  it('forces the recognition tool via tool_choice', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: ['Rice'] });
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'report_recognized_ingredients' });
    expect(params.tools).toHaveLength(1);
    expect(params.model).toBe('claude-haiku-4-5');
  });

  it('embeds the image as a base64 JPEG content block', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const imageBlock = content.find((b) => b.type === 'image');
    expect(imageBlock).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' },
    });
  });

  it('includes the product names in the prompt text when present', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: ['Rice', 'Chicken breast'] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text).toContain('Rice');
    expect(textBlock?.text).toContain('Chicken breast');
  });
});

describe('parseAnthropicToolResult', () => {
  it('parses matched and unmatched items', () => {
    const items = parseAnthropicToolResult({
      items: [
        { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
        { name: 'Sauteed spinach', matchedProductName: null },
      ],
    });
    expect(items).toEqual([
      { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
      { name: 'Sauteed spinach', matchedProductName: null },
    ]);
  });

  it('treats a missing items array as malformed', () => {
    expect(() => parseAnthropicToolResult({})).toThrow(RecognizeRequestError);
  });

  it('treats an item missing a name as malformed', () => {
    expect(() => parseAnthropicToolResult({ items: [{ matchedProductName: null }] })).toThrow(
      RecognizeRequestError
    );
  });

  it('treats a non-string, non-null matchedProductName as unmatched rather than failing', () => {
    const items = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: 42 }] });
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker" && npx vitest run
```

Expected: FAIL — `./recognize` does not exist yet.

- [ ] **Step 3: Implement `worker/src/recognize.ts`**

```typescript
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
}

export interface RecognizeRequestBody {
  image: string;
  productNames: string[];
}

export class RecognizeRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'RecognizeRequestError';
  }
}

export function checkAuth(providedSecret: string | null, expectedSecret: string): boolean {
  return providedSecret !== null && providedSecret === expectedSecret;
}

export function parseRecognizeRequestBody(body: unknown): RecognizeRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new RecognizeRequestError('Request body must be a JSON object', 400);
  }
  const { image, productNames } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new RecognizeRequestError('"image" must be a non-empty base64 string', 400);
  }
  if (!Array.isArray(productNames) || !productNames.every((p) => typeof p === 'string')) {
    throw new RecognizeRequestError('"productNames" must be an array of strings', 400);
  }
  return { image, productNames };
}

const RECOGNIZE_TOOL_NAME = 'report_recognized_ingredients';

function buildToolDefinition() {
  return {
    name: RECOGNIZE_TOOL_NAME,
    description:
      'Report every distinct ingredient visible in the dish photo, matched against the provided list of existing product names where possible.',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The ingredient name as you identify it from the photo.',
              },
              matchedProductName: {
                type: ['string', 'null'],
                description:
                  "The exact matching name from the supplied product list, if this ingredient corresponds to one of them in meaning. Null if it does not match any of them.",
              },
            },
            required: ['name', 'matchedProductName'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  };
}

export function buildAnthropicRequestParams(body: RecognizeRequestBody) {
  const productListText =
    body.productNames.length > 0
      ? `The user's existing product list:\n${body.productNames.map((n) => `- ${n}`).join('\n')}`
      : "The user's product list is currently empty.";

  return {
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    tool_choice: { type: 'tool' as const, name: RECOGNIZE_TOOL_NAME },
    tools: [buildToolDefinition()],
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: body.image },
          },
          {
            type: 'text' as const,
            text: `Identify every distinct ingredient visible in this dish photo. ${productListText}\n\nFor each ingredient, report its name and, if it matches one of the listed products in meaning (not necessarily exact wording), report that product's exact name as matchedProductName. Otherwise set matchedProductName to null.`,
          },
        ],
      },
    ],
  };
}

export function parseAnthropicToolResult(input: unknown): RecognizedItem[] {
  if (typeof input !== 'object' || input === null || !('items' in input)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const { items } = input as { items: unknown };
  if (!Array.isArray(items)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  return items.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
      throw new RecognizeRequestError('Unexpected item shape from recognition model', 502);
    }
    const { name, matchedProductName } = item as Record<string, unknown>;
    return {
      name: name as string,
      matchedProductName: typeof matchedProductName === 'string' ? matchedProductName : null,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker" && npx vitest run
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP"
git add worker/src/recognize.ts worker/src/recognize.test.ts
git commit -m "feat: add dish recognition request/response logic for the worker"
```

---

## Task 4: Worker HTTP handler

**Files:**
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: everything exported by `worker/src/recognize.ts` (Task 3).
- Produces: `POST /recognize` — `Headers: X-App-Secret` — `Body: { image: string, productNames: string[] }` → `200 { items: RecognizedItem[] }` or `4xx/5xx { error: string }`, consumed by the client service in Task 6.

- [ ] **Step 1: Replace `worker/src/index.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import {
  buildAnthropicRequestParams,
  checkAuth,
  parseAnthropicToolResult,
  parseRecognizeRequestBody,
  RecognizeRequestError,
} from './recognize';

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_SHARED_SECRET: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/recognize') {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    if (!checkAuth(request.headers.get('X-App-Secret'), env.APP_SHARED_SECRET)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

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
    } catch {
      return jsonResponse({ error: 'Recognition request failed' }, 502);
    }

    const toolUse = message.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return jsonResponse({ error: 'Model did not return a tool result' }, 502);
    }

    try {
      const items = parseAnthropicToolResult(toolUse.input);
      return jsonResponse({ items }, 200);
    } catch (e) {
      const status = e instanceof RecognizeRequestError ? e.status : 502;
      return jsonResponse({ error: e instanceof Error ? e.message : 'Invalid model response' }, status);
    }
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker" && npx tsc --noEmit
```

Expected: passes with no errors.

- [ ] **Step 3: Manually smoke-test with `wrangler dev` (requires an Anthropic API key)**

This step needs real credentials and is not part of the automated test suite — do it once to confirm the deployment shape works, note the result, and move on regardless (deploying/keys are a user setup step, not blocking for the rest of this plan):

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker"
npx wrangler secret put ANTHROPIC_API_KEY --local
npx wrangler secret put APP_SHARED_SECRET --local
npx wrangler dev
```

In another terminal, with a real base64 JPEG in `image.b64`:

```bash
curl -s -X POST http://localhost:8787/recognize \
  -H "Content-Type: application/json" \
  -H "X-App-Secret: <value you set above>" \
  -d "{\"image\": \"$(cat image.b64)\", \"productNames\": [\"Rice\", \"Chicken breast\"]}"
```

Expected: `200` with `{"items": [...]}`. A `401` means the header didn't match; a `502` means the Anthropic call or its parsing failed — check the `wrangler dev` console output.

- [ ] **Step 4: Deploy and configure abuse protection (one-time setup, not automated)**

This is account-level setup the user does once the Worker is ready to go live — it needs a Cloudflare account and isn't something to script here:

```bash
cd "D:/РАЗРАБОТКА/DIA-APP/worker"
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_SHARED_SECRET
npx wrangler deploy
```

`wrangler deploy` prints the Worker's live URL (`https://dia-app-dish-recognition.<subdomain>.workers.dev`) — put that plus the `APP_SHARED_SECRET` value into the app's real `.env` (see Task 1's `.env.example`). Then, in the Cloudflare dashboard for this Worker, add a Rate Limiting rule on the `/recognize` route (Security → WAF → Rate limiting rules, or the Worker's own "Triggers" settings depending on current dashboard layout) as the second layer of abuse protection the design spec calls for, alongside the shared-secret header already enforced in code.

- [ ] **Step 5: Commit**

```bash
cd "D:/РАЗРАБОТКА/DIA-APP"
git add worker/src/index.ts
git commit -m "feat: add /recognize HTTP handler to the worker"
```

---

## Task 5: `getProductByName` in the products repository

**Files:**
- Modify: `src/repositories/productsRepo.ts`
- Test: `__tests__/repositories/productsRepo.test.ts`

**Interfaces:**
- Produces: `getProductByName(db: SqlExecutor, name: string): Promise<Product | null>` — exact, case-insensitive match — consumed by `PhotoReviewScreen` in Task 9.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/repositories/productsRepo.test.ts` (inside the existing `describe('productsRepo', ...)` block, alongside the other `it(...)` cases):

```typescript
  it('finds a product by exact, case-insensitive name match', async () => {
    await createProduct(db, { name: 'Chicken Breast', carbsPer100g: 0 });
    const found = await getProductByName(db, 'chicken breast');
    expect(found?.name).toBe('Chicken Breast');
  });

  it('returns null when no product matches the name exactly', async () => {
    await createProduct(db, { name: 'Chicken Breast', carbsPer100g: 0 });
    expect(await getProductByName(db, 'Chicken')).toBeNull();
  });
```

Add `getProductByName` to the existing import line at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest __tests__/repositories/productsRepo.test.ts
```

Expected: FAIL — `getProductByName` is not exported.

- [ ] **Step 3: Add `getProductByName` to `src/repositories/productsRepo.ts`**

Add this function after `listProducts`:

```typescript
export async function getProductByName(db: SqlExecutor, name: string): Promise<Product | null> {
  const row = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE name = ? COLLATE NOCASE', [name]);
  return row ? rowToProduct(row) : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest __tests__/repositories/productsRepo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/productsRepo.ts __tests__/repositories/productsRepo.test.ts
git commit -m "feat: add exact-name product lookup for recognition matching"
```

---

## Task 6: Client recognition service

**Files:**
- Create: `src/services/dishRecognition.ts`
- Test: `__tests__/services/dishRecognition.test.ts`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_RECOGNITION_API_URL`, `EXPO_PUBLIC_RECOGNITION_API_SECRET` (Task 1).
- Produces: `RecognizedItem { name: string; matchedProductName: string | null }`, `DishRecognitionError`, `recognizeDish(imageBase64: string, productNames: string[]): Promise<RecognizedItem[]>` — consumed by `PhotoRecognitionButton` in Task 8.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/dishRecognition.test.ts`, following the existing `openFoodFacts.test.ts` pattern of mocking `global.fetch`:

```typescript
import { recognizeDish, DishRecognitionError } from '../../src/services/dishRecognition';

const ORIGINAL_ENV = process.env;

describe('recognizeDish', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_RECOGNITION_API_URL: 'https://worker.example/recognize',
      EXPO_PUBLIC_RECOGNITION_API_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('sends the image and product names, returning parsed items', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ name: 'Rice', matchedProductName: 'Rice' }] }),
    }) as unknown as typeof fetch;

    const items = await recognizeDish('base64data', ['Rice']);

    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice' }]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/recognize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-App-Secret': 'test-secret' }),
        body: JSON.stringify({ image: 'base64data', productNames: ['Rice'] }),
      })
    );
  });

  it('throws DishRecognitionError when the network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });

  it('throws DishRecognitionError when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });

  it('throws DishRecognitionError when the API is not configured', async () => {
    process.env.EXPO_PUBLIC_RECOGNITION_API_URL = '';
    process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET = '';

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest __tests__/services/dishRecognition.test.ts
```

Expected: FAIL — `src/services/dishRecognition.ts` does not exist yet.

- [ ] **Step 3: Implement `src/services/dishRecognition.ts`**

```typescript
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
}

export class DishRecognitionError extends Error {}

export async function recognizeDish(imageBase64: string, productNames: string[]): Promise<RecognizedItem[]> {
  const apiUrl = process.env.EXPO_PUBLIC_RECOGNITION_API_URL;
  const apiSecret = process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET;
  if (!apiUrl || !apiSecret) {
    throw new DishRecognitionError('Recognition service is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': apiSecret },
      body: JSON.stringify({ image: imageBase64, productNames }),
    });
  } catch {
    throw new DishRecognitionError('Could not reach recognition service. Check your connection.');
  }

  if (!response.ok) {
    throw new DishRecognitionError('Recognition failed. Try again or add ingredients manually.');
  }

  const data = (await response.json()) as { items?: RecognizedItem[] };
  return data.items ?? [];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest __tests__/services/dishRecognition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/dishRecognition.ts __tests__/services/dishRecognition.test.ts
git commit -m "feat: add client service for calling the dish recognition worker"
```

---

## Task 7: Navigation — types and screen registration

**Files:**
- Modify: `src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `RecognizedItem` (Task 6), `Product` (existing, from `productsRepo`).
- Produces: `DishesStackParamList` gains `PhotoReview` and `ProductForm` routes; `ProductFormParams` type shared by both stacks — consumed by `ProductFormScreen` (Task 10 edit), `PhotoReviewScreen` (Task 9), `DishFormScreen` (Task 10).

- [ ] **Step 1: Update `src/navigation/RootNavigator.tsx`**

```typescript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProductsListScreen from '../screens/ProductsListScreen';
import ProductFormScreen from '../screens/ProductFormScreen';
import DishesListScreen from '../screens/DishesListScreen';
import DishFormScreen from '../screens/DishFormScreen';
import PhotoReviewScreen from '../screens/PhotoReviewScreen';
import type { Product } from '../repositories/productsRepo';
import type { RecognizedItem } from '../services/dishRecognition';

export type ProductFormParams = {
  productId?: string;
  prefillName?: string;
  onCreated?: (product: Product) => void;
};

export type ProductsStackParamList = {
  ProductsList: undefined;
  ProductForm: ProductFormParams;
};

export type PhotoReviewParams = {
  items: RecognizedItem[];
  onConfirm: (result: { matchedProducts: Product[]; unmatchedNames: string[] }) => void;
};

export type DishesStackParamList = {
  DishesList: undefined;
  DishForm: { dishId?: string };
  PhotoReview: PhotoReviewParams;
  ProductForm: ProductFormParams;
};

const ProductsStack = createNativeStackNavigator<ProductsStackParamList>();
const DishesStack = createNativeStackNavigator<DishesStackParamList>();
const Tab = createBottomTabNavigator();

function ProductsStackNavigator() {
  return (
    <ProductsStack.Navigator>
      <ProductsStack.Screen name="ProductsList" component={ProductsListScreen} options={{ title: 'Products' }} />
      <ProductsStack.Screen name="ProductForm" component={ProductFormScreen} options={{ title: 'Product' }} />
    </ProductsStack.Navigator>
  );
}

function DishesStackNavigator() {
  return (
    <DishesStack.Navigator>
      <DishesStack.Screen name="DishesList" component={DishesListScreen} options={{ title: 'Dishes' }} />
      <DishesStack.Screen name="DishForm" component={DishFormScreen} options={{ title: 'Dish' }} />
      <DishesStack.Screen
        name="PhotoReview"
        component={PhotoReviewScreen}
        options={{ title: 'Recognized Ingredients' }}
      />
      <DishesStack.Screen name="ProductForm" component={ProductFormScreen} options={{ title: 'Product' }} />
    </DishesStack.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="ProductsTab" component={ProductsStackNavigator} options={{ title: 'Products' }} />
        <Tab.Screen name="DishesTab" component={DishesStackNavigator} options={{ title: 'Dishes' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

This references `./PhotoReviewScreen`, which doesn't exist until Task 9 — `tsc` will fail until then, which is expected and resolved by the end of Task 9. Do not run `tsc --noEmit` as a pass/fail gate for this task; just confirm the file saves without a syntax error (the editor/IDE diagnostics, not a build step).

- [ ] **Step 2: Commit**

```bash
git add src/navigation/RootNavigator.tsx
git commit -m "feat: add PhotoReview and cross-stack ProductForm navigation types"
```

---

## Task 8: `PhotoRecognitionButton` component

**Files:**
- Create: `src/screens/PhotoRecognitionButton.tsx`

**Interfaces:**
- Consumes: `recognizeDish`, `RecognizedItem`, `DishRecognitionError` (Task 6); `listProducts` (existing); `openDatabase` (existing).
- Produces: `<PhotoRecognitionButton onRecognized={(items: RecognizedItem[]) => void} />` — consumed by `DishFormScreen` in Task 10.

- [ ] **Step 1: Create `src/screens/PhotoRecognitionButton.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../db/database';
import { listProducts } from '../repositories/productsRepo';
import { recognizeDish, RecognizedItem, DishRecognitionError } from '../services/dishRecognition';

interface Props {
  onRecognized: (items: RecognizedItem[]) => void;
}

// 1x1 transparent PNG — a valid placeholder source so the manipulator hook
// always has something to bind to before the user has picked a real photo.
const PLACEHOLDER_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export default function PhotoRecognitionButton({ onRecognized }: Props) {
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manipulatorContext = useImageManipulator(pickedUri ?? PLACEHOLDER_URI);

  useEffect(() => {
    if (!pickedUri) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rendered = await manipulatorContext.resize({ width: 1024, height: null }).renderAsync();
        const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
        if (!saved.base64) {
          throw new DishRecognitionError('Could not process the photo.');
        }
        const db = await openDatabase();
        const productNames = (await listProducts(db, '')).map((p) => p.name);
        const items = await recognizeDish(saved.base64, productNames);
        onRecognized(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.');
      } finally {
        setLoading(false);
        setPickedUri(null);
      }
    })();
    // manipulatorContext is derived from pickedUri each render; re-running
    // this effect only on pickedUri change is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedUri]);

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Camera/photo access is needed for this feature.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    setPickedUri(result.assets[0].uri);
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('camera')} disabled={loading}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('gallery')} disabled={loading}>
          <Text style={styles.buttonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator style={styles.loading} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8, padding: 10, alignItems: 'center' },
  buttonText: { color: '#2e7d32', fontWeight: '600' },
  loading: { marginTop: 8 },
  error: { color: '#c62828', marginTop: 8 },
});
```

Note: this deviates slightly from the design spec's "action sheet" wording — it uses two always-visible buttons instead of one button plus an OS action sheet. This is simpler, avoids a native-modal dependency, and is easier to verify on web (an `Alert.alert` with multiple custom buttons renders unreliably under react-native-web). It's functionally equivalent: the user still explicitly chooses camera vs. gallery.

- [ ] **Step 2: Verify it compiles** (will still fail until Task 9 adds `PhotoReviewScreen` referenced by `RootNavigator.tsx` — that's fine, this task's file itself has no unresolved imports)

```bash
npx tsc --noEmit
```

Expected: the only errors, if any, are about `PhotoReviewScreen` missing (from Task 7) — nothing referencing `PhotoRecognitionButton.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/screens/PhotoRecognitionButton.tsx
git commit -m "feat: add photo capture and recognition trigger component"
```

---

## Task 9: `PhotoReviewScreen`

**Files:**
- Create: `src/screens/PhotoReviewScreen.tsx`

**Interfaces:**
- Consumes: `PhotoReviewParams` (Task 7); `getProductByName` (Task 5); `openDatabase` (existing).
- Produces: the `PhotoReview` screen referenced by `RootNavigator.tsx` (Task 7) and navigated to from `DishFormScreen` (Task 10).

- [ ] **Step 1: Create `src/screens/PhotoReviewScreen.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { getProductByName, Product } from '../repositories/productsRepo';
import type { DishesStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<DishesStackParamList, 'PhotoReview'>;
type Route = RouteProp<DishesStackParamList, 'PhotoReview'>;

interface ReviewRow {
  name: string;
  product: Product | null;
  checked: boolean;
}

export default function PhotoReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { items, onConfirm } = route.params;

  const [rows, setRows] = useState<ReviewRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDatabase();
      const resolved = await Promise.all(
        items.map(async (item) => {
          const product = item.matchedProductName ? await getProductByName(db, item.matchedProductName) : null;
          return { name: item.name, product, checked: true };
        })
      );
      setRows(resolved);
    })();
  }, [items]);

  const toggle = (index: number) => {
    setRows((prev) => (prev ? prev.map((row, i) => (i === index ? { ...row, checked: !row.checked } : row)) : prev));
  };

  const handleConfirm = () => {
    if (!rows) return;
    const matchedProducts = rows.filter((r) => r.checked && r.product).map((r) => r.product as Product);
    const unmatchedNames = rows.filter((r) => r.checked && !r.product).map((r) => r.name);
    onConfirm({ matchedProducts, unmatchedNames });
    navigation.goBack();
  };

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text>No ingredients recognized.</Text>
        <TouchableOpacity style={styles.saveButton} onPress={() => navigation.goBack()}>
          <Text style={styles.saveButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Recognized ingredients</Text>
      {rows.map((row, index) => (
        <TouchableOpacity key={`${row.name}-${index}`} style={styles.row} onPress={() => toggle(index)}>
          <Text style={styles.checkbox}>{row.checked ? '\u2611' : '\u2610'}</Text>
          <Text style={styles.rowText}>{row.product ? row.product.name : `New: ${row.name}`}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.saveButton} onPress={handleConfirm}>
        <Text style={styles.saveButtonText}>Add to dish</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, color: '#555', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  checkbox: { fontSize: 20, marginRight: 12 },
  rowText: { fontSize: 16 },
  saveButton: { marginTop: 20, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 2: Verify the whole project compiles now**

```bash
npx tsc --noEmit
```

Expected: passes — `RootNavigator.tsx`'s reference to `PhotoReviewScreen` now resolves. (`DishFormScreen` doesn't yet use `PhotoRecognitionButton` or the new params — that's Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/PhotoReviewScreen.tsx
git commit -m "feat: add photo recognition review screen"
```

---

## Task 10: Wire recognition into `DishFormScreen` and `ProductFormScreen`

**Files:**
- Modify: `src/screens/DishFormScreen.tsx`
- Modify: `src/screens/ProductFormScreen.tsx`

**Interfaces:**
- Consumes: `PhotoRecognitionButton` (Task 8), `ProductFormParams` / `PhotoReviewParams` (Task 7), `RecognizedItem` (Task 6).
- Produces: the complete end-to-end feature — the deliverable this whole module builds toward.

- [ ] **Step 1: Extend `ProductFormScreen` to accept `prefillName` and `onCreated`**

In `src/screens/ProductFormScreen.tsx`:

Change the route param destructuring and add prefill handling. Replace:

```typescript
  const productId = route.params?.productId;

  const [name, setName] = useState('');
```

with:

```typescript
  const productId = route.params?.productId;
  const prefillName = route.params?.prefillName;

  const [name, setName] = useState(prefillName ?? '');
```

Change `handleSave` so a newly created product is reported back before navigating away. Replace:

```typescript
      if (productId) {
        await updateProduct(db, productId, { name: name.trim(), carbsPer100g: carbsValue });
      } else {
        await createProduct(db, { name: name.trim(), carbsPer100g: carbsValue });
      }
      navigation.goBack();
```

with:

```typescript
      if (productId) {
        await updateProduct(db, productId, { name: name.trim(), carbsPer100g: carbsValue });
      } else {
        const created = await createProduct(db, { name: name.trim(), carbsPer100g: carbsValue });
        route.params?.onCreated?.(created);
      }
      navigation.goBack();
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Extend `DishFormScreen`**

In `src/screens/DishFormScreen.tsx`:

Add imports (after the existing `import { dishTotals } from '../calculations/carbs';` line):

```typescript
import PhotoRecognitionButton from './PhotoRecognitionButton';
import type { RecognizedItem } from '../services/dishRecognition';
```

Make `addIngredient` safe to call in a batch by moving the duplicate check inside the functional state update — replace:

```typescript
  const addIngredient = (product: Product) => {
    if (items.some((item) => item.productId === product.id)) {
      setError('Already added');
      return;
    }
    setItems((prev) => [
      ...prev,
      { productId: product.id, productName: product.name, carbsPer100g: product.carbsPer100g, gramsText: '' },
    ]);
    setProductSearch('');
    setMatches([]);
  };
```

with:

```typescript
  const addIngredient = (product: Product) => {
    setItems((prev) => {
      if (prev.some((item) => item.productId === product.id)) {
        setError('Already added');
        return prev;
      }
      return [
        ...prev,
        { productId: product.id, productName: product.name, carbsPer100g: product.carbsPer100g, gramsText: '' },
      ];
    });
    setProductSearch('');
    setMatches([]);
  };
```

Add state and the review-confirmation/unmatched-product-creation flow. Add after the existing `const [error, setError] = useState<string | null>(null);` line:

```typescript
  const [pendingUnmatchedNames, setPendingUnmatchedNames] = useState<string[]>([]);

  const handleRecognized = (recognizedItems: RecognizedItem[]) => {
    navigation.navigate('PhotoReview', {
      items: recognizedItems,
      onConfirm: (result) => {
        result.matchedProducts.forEach(addIngredient);
        setPendingUnmatchedNames(result.unmatchedNames);
      },
    });
  };

  useEffect(() => {
    if (pendingUnmatchedNames.length === 0) return;
    navigation.navigate('ProductForm', {
      prefillName: pendingUnmatchedNames[0],
      onCreated: (product) => {
        addIngredient(product);
        setPendingUnmatchedNames((prev) => prev.slice(1));
      },
    });
  }, [pendingUnmatchedNames]);
```

Render the button in the form, after the ingredients list and before the manual product-search input. Replace:

```typescript
        <Text style={styles.label}>Ingredients</Text>
        {items.map((item, index) => (
```

with:

```typescript
        <Text style={styles.label}>Ingredients</Text>
        <PhotoRecognitionButton onRecognized={handleRecognized} />
        {items.map((item, index) => (
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Run the full test suite**

```bash
npx jest
```

Expected: all suites pass (existing + the new ones from Tasks 5 and 6).

- [ ] **Step 6: Commit**

```bash
git add src/screens/DishFormScreen.tsx src/screens/ProductFormScreen.tsx
git commit -m "feat: wire photo recognition into the dish form"
```

---

## Task 11: Web verification of the gallery path

**Files:** none (manual verification, no code changes expected unless it surfaces a bug)

**Interfaces:** none — this task exercises the full stack built in Tasks 1–10.

- [ ] **Step 1: Start the web build**

```bash
npx expo start --web
```

(If `react-dom`/`react-native-web` aren't installed, install them temporarily exactly as Module 1's verification did, and revert afterward — see `docs/superpowers/specs/2026-08-06-carb-database-design.md`'s verification notes for the precedent.)

- [ ] **Step 2: Drive it with chrome-devtools MCP**

Using the chrome-devtools MCP tools (`new_page`, `navigate_page`, `take_snapshot`, `click`, `upload_file`, etc.):

1. Navigate to a dish's form (create a new dish or open an existing one).
2. Click "Choose from Gallery". On web, `expo-image-picker`'s gallery path resolves to a browser file input — use `upload_file` (or `click` + file chooser handling) to supply a sample JPEG.
3. Confirm the loading indicator appears, then the app navigates to the "Recognized Ingredients" review screen with a checklist.
4. Uncheck one item, then tap "Add to dish".
5. Confirm matched items appear in the dish's ingredient list with a blank grams field.
6. If any item was unmatched, confirm the app navigates to the product form pre-filled with that name; save it and confirm the app returns to the dish form with that product now in the ingredient list.
7. Check the console (`list_console_messages`) for unexpected errors.

- [ ] **Step 2: Record the outcome**

If everything above works: the gallery path is verified end-to-end (client → Worker → Claude → review → dish). Camera capture remains unverified in this environment, consistent with the design spec's stated caveat — do not attempt to fake or skip this distinction when reporting results.

If something fails: fix it, re-run the relevant unit tests (`npx jest`, and `npx vitest run` from `worker/` if the fix touches the Worker), and re-verify in the browser before considering this task done.

- [ ] **Step 3: Final full check and commit (only if Step 2 required code changes)**

```bash
npx tsc --noEmit
npx jest
cd worker && npx tsc --noEmit && npx vitest run && cd ..
```

```bash
git add -A
git commit -m "fix: address issues found during web verification of dish recognition"
```

(Skip this step entirely if Step 2 required no changes.)
