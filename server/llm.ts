import fs from 'node:fs';
import { secretsPath } from './paths';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelResponse {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface ModelCallOptions {
  messages: ModelMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

interface Secrets {
  modelApiKey?: string;
  /** 服务档案密钥：key = ServiceProfile.id，与主密钥隔离存放 */
  serviceKeys?: Record<string, string>;
}

export function readSecrets(): Secrets {
  try {
    return JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Secrets;
  } catch {
    return {};
  }
}

export function writeSecrets(next: Secrets) {
  fs.mkdirSync(secretsPath.replace(/[^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(secretsPath, JSON.stringify(next, null, 2), 'utf8');
}

export function clearApiKey() {
  const secrets = readSecrets();
  delete secrets.modelApiKey;
  writeSecrets(secrets);
}

export function setApiKey(value: string) {
  const secrets = readSecrets();
  secrets.modelApiKey = value.trim();
  writeSecrets(secrets);
}

export function getServiceKey(serviceId: string): string | undefined {
  return readSecrets().serviceKeys?.[serviceId];
}

export function setServiceKey(serviceId: string, value: string) {
  const secrets = readSecrets();
  secrets.serviceKeys = { ...(secrets.serviceKeys ?? {}), [serviceId]: value.trim() };
  writeSecrets(secrets);
}

export function clearServiceKey(serviceId: string) {
  const secrets = readSecrets();
  if (secrets.serviceKeys) delete secrets.serviceKeys[serviceId];
  writeSecrets(secrets);
}

export function modelConfigured(baseUrl: string, modelName: string): boolean {
  return Boolean(baseUrl && modelName && readSecrets().modelApiKey);
}

export class ModelUnavailableError extends Error {
  constructor(message = '未配置模型服务，系统已回落到本地确定性引擎。') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export async function callModel(
  settings: {
    modelBaseUrl: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
    /** 服务档案自带密钥；不传则回落到全局 modelApiKey */
    apiKey?: string;
  },
  options: ModelCallOptions
): Promise<ModelResponse> {
  const apiKey = settings.apiKey ?? readSecrets().modelApiKey;
  if (!apiKey || !settings.modelBaseUrl || !settings.modelName) {
    throw new ModelUnavailableError();
  }
  const startedAt = Date.now();
  const endpoint = `${settings.modelBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.modelName,
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 3000,
        ...(options.json ? { response_format: { type: 'json_object' } } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`模型服务返回 ${response.status}：${detail.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    return {
      text,
      provider: new URL(settings.modelBaseUrl).host,
      model: payload.model ?? settings.modelName,
      durationMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonLoose(raw: string): unknown {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('模型没有返回内容');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fallthrough */
      }
    }
    throw new Error('模型返回的内容不是可解析的 JSON');
  }
}

export async function testModel(settings: {
  modelBaseUrl: string;
  modelName: string;
  apiKey?: string;
}) {
  const startedAt = Date.now();
  const response = await callModel(
    { ...settings, temperature: 0, maxTokens: 64 },
    {
      messages: [
        { role: 'system', content: '只回复 JSON。' },
        { role: 'user', content: '请回复 {"ok":true}' }
      ],
      json: true
    }
  );
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    model: response.model,
    provider: response.provider,
    protocol: 'openai-compatible',
    message: '模型服务可用'
  };
}

/** 解析当前真正生效的模型：优先用激活的 chat 服务档案，其次回落全局设置。 */
export interface ResolvedModel {
  modelBaseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  source: string;
}

export function resolveModel(db: {
  services: { id: string; kind: string; name: string; baseUrl: string; model: string; active: boolean }[];
  settings: { modelBaseUrl: string; modelName: string; temperature: number; maxTokens: number };
}): ResolvedModel {
  const secrets = readSecrets();
  const service = db.services.find((item) => item.kind === 'chat' && item.active);
  if (service) {
    const apiKey = getServiceKey(service.id) ?? secrets.modelApiKey;
    if (service.baseUrl && service.model && apiKey) {
      return {
        modelBaseUrl: service.baseUrl,
        modelName: service.model,
        temperature: db.settings.temperature,
        maxTokens: db.settings.maxTokens,
        apiKey,
        source: service.name
      };
    }
  }
  return {
    modelBaseUrl: db.settings.modelBaseUrl,
    modelName: db.settings.modelName,
    temperature: db.settings.temperature,
    maxTokens: db.settings.maxTokens,
    apiKey: secrets.modelApiKey,
    source: '全局模型设置'
  };
}