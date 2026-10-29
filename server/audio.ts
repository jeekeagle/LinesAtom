/**
 * MiMo 音频服务客户端（OpenAI 兼容的 chat/completions 形态）。
 * 语音合成：mimo-v2.5-tts 系列；语音识别：mimo-v2.5-asr。
 */
export const MIMO_DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const MIMO_TTS_VOICES = [
  'mimo_default',
  '冰糖',
  '茉莉',
  '苏打',
  '白桦',
  'Mia',
  'Chloe',
  'Milo',
  'Dean'
] as const;
export const MIMO_TTS_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'] as const;
export const MIMO_ASR_MODELS = ['mimo-v2.5-asr'] as const;

const headers = (apiKey: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'api-key': apiKey,
  Authorization: `Bearer ${apiKey}`
});

async function postJson(baseUrl: string, apiKey: string, body: unknown, timeoutMs = 60_000) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      const hint =
        response.status === 401 || response.status === 403
          ? '密钥无效或无权限，请在设置台重新填写 API Key。'
          : `服务返回 ${response.status}`;
      throw new Error(`${hint}：${detail}`);
    }
    return (await response.json()) as Record<string, any>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('音频服务超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface TtsOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  voice?: string;
  style?: string;
  text: string;
  format?: 'wav' | 'mp3';
}

export interface TtsResult {
  audioBase64: string;
  format: 'wav' | 'mp3';
  voice: string;
  model: string;
  latencyMs: number;
}

export async function synthesizeSpeech(options: TtsOptions): Promise<TtsResult> {
  const text = options.text.trim();
  if (!text) throw new Error('缺少要合成的文本。');
  if (Array.from(text).length > 1500) throw new Error('单次合成文本过长，请拆分后重试。');
  const model = options.model || 'mimo-v2.5-tts';
  const voice = options.voice || '冰糖';
  const format = options.format === 'mp3' ? 'mp3' : 'wav';
  const startedAt = Date.now();
  const messages: { role: string; content: string }[] = [];
  const style = options.style?.trim();
  if (style) messages.push({ role: 'user', content: style });
  messages.push({ role: 'assistant', content: text });

  const payload = await postJson(options.baseUrl, options.apiKey, {
    model,
    messages,
    audio: { format, voice }
  });
  const message = payload.choices?.[0]?.message;
  const audio = message?.audio?.data;
  if (!audio) {
    throw new Error(`语音合成未返回音频：${JSON.stringify(message ?? payload).slice(0, 200)}`);
  }
  return {
    audioBase64: audio,
    format,
    voice,
    model: payload.model ?? model,
    latencyMs: Date.now() - startedAt
  };
}

export interface AsrOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  language?: string;
  audioBase64: string;
  format?: 'wav' | 'mp3';
}

export interface AsrResult {
  text: string;
  model: string;
  latencyMs: number;
}

export async function transcribeSpeech(options: AsrOptions): Promise<AsrResult> {
  const data = options.audioBase64.trim();
  if (!data) throw new Error('缺少待识别的音频。');
  const format = options.format === 'mp3' ? 'mp3' : 'wav';
  const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
  const language = ['auto', 'zh', 'en'].includes(options.language ?? '')
    ? (options.language as string)
    : 'auto';
  const startedAt = Date.now();
  const payload = await postJson(options.baseUrl, options.apiKey, {
    model: options.model || 'mimo-v2.5-asr',
    messages: [
      {
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${data}` } }]
      }
    ],
    asr_options: { language }
  });
  const text = payload.choices?.[0]?.message?.content ?? '';
  return {
    text: typeof text === 'string' ? text : JSON.stringify(text),
    model: payload.model ?? options.model ?? 'mimo-v2.5-asr',
    latencyMs: Date.now() - startedAt
  };
}

/** 切换模型用：拉取兼容端点的模型清单。 */
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, { headers: headers(apiKey), signal: controller.signal });
    if (!response.ok) throw new Error(`模型清单返回 ${response.status}`);
    const payload = (await response.json()) as { data?: { id?: string }[] };
    return (payload.data ?? []).map((item) => item.id ?? '').filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}
