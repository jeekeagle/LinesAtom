/** 中文讲稿文本工具：切句、分段、概念抽取、标签判定。 */

export const SENTENCE_END = /[。！？!?；;]/;

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function charCount(value: unknown): number {
  return Array.from(String(value ?? '').replace(/\s/g, '')).length;
}

export function clampText(value: string, max: number): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, max).join('')}`;
}

export function splitLongSentence(sentence: string, max = 110): string[] {
  if (charCount(sentence) <= max) return [sentence];
  const parts = sentence.split(/(?<=[，,])/);
  const out: string[] = [];
  let buffer = '';
  for (const part of parts) {
    if (buffer && charCount(buffer + part) > max) {
      out.push(buffer.trim());
      buffer = '';
    }
    buffer += part;
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter(Boolean);
}

export function splitSentences(text: string): string[] {
  const normalized = normalizeText(text);
  const out: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let buffer = '';
    for (const ch of trimmed) {
      buffer += ch;
      if (SENTENCE_END.test(ch)) {
        if (buffer.trim()) out.push(buffer.trim());
        buffer = '';
      }
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out.flatMap((item) => splitLongSentence(item)).filter(Boolean);
}

const HEADING_PATTERNS: RegExp[] = [
  /^#{1,6}\s+(.+)$/,
  /^第[一二三四五六七八九十百\d]+[章节讲部分]\s*[·:：、\-]?\s*(.*)$/,
  /^[一二三四五六七八九十]+\s*[、.．]\s*(.+)$/,
  /^[（(][一二三四五六七八九十\d]+[）)]\s*(.+)$/,
  /^\d+[、.．]\s*(.+)$/
];

export function parseHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) return null;
  for (const pattern of HEADING_PATTERNS) {
    const matched = trimmed.match(pattern);
    if (matched) {
      const title = (matched[1] || '').trim();
      if (title) return title;
    }
  }
  return null;
}

export interface ParsedSection {
  id: string;
  order: number;
  title: string;
  short: string;
  text: string;
  sentences: string[];
}

export function shortTitle(title: string, max = 8): string {
  const cleaned = title.replace(/[。！？!?，,、]/g, '').trim();
  return clampText(cleaned, max);
}

export function parseSections(material: string, topic: string): ParsedSection[] {
  const lines = normalizeText(material).split('\n');
  const buckets: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      if (current) buckets.push(current);
      current = { title: heading, lines: [] };
      continue;
    }
    if (!current) current = { title: topic || '开场', lines: [] };
    current.lines.push(line);
  }
  if (current) buckets.push(current);

  const cleaned = buckets.filter((item) => item.lines.join('').trim().length > 0);
  const source = cleaned.length ? cleaned : [{ title: topic || '开场', lines: lines }];

  return source.map((item, index) => {
    const text = item.lines.join('\n').trim();
    const sentences = splitSentences(text);
    return {
      id: `s${index + 1}`,
      order: index + 1,
      title: item.title,
      short: shortTitle(item.title),
      text,
      sentences
    };
  });
}

const STOP_TERMS = new Set([
  '我们', '他们', '它们', '这个', '那个', '这些', '那些', '问题', '时候', '东西',
  '事情', '方面', '情况', '因此', '所以', '但是', '如果', '因为', '例如', '比如',
  '也就是说', '换句话说', '一个', '一种', '一样', '什么', '怎么', '为什么', '这里',
  '那里', '现在', '然后', '接着', '最后', '第一', '第二', '第三', '可以', '需要',
  '应该', '能够', '不是', '而是', '就是', '这个概念', '概念本身'
]);

export interface CandidateConcept {
  name: string;
  definition: string;
  sentence: string;
  source: 'skeleton' | 'material';
  order: number;
}

const DEFINITION_RE =
  /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·\-]{1,11})\s*[，,]?\s*(?:是指|指的是|是|指|就是|意味着|定义为)\s*([^。！？!?；;]{4,60})/g;

const QUOTED_RE = /[“"「]([^”"」]{2,10})[”"」]\s*(?:是指|指的是|是|指|就是)/g;

export function extractCandidates(sentences: string[]): CandidateConcept[] {
  const found = new Map<string, CandidateConcept>();
  let order = 0;
  for (const sentence of sentences) {
    order += 1;
    const pushes: string[] = [];
    DEFINITION_RE.lastIndex = 0;
    let matched = DEFINITION_RE.exec(sentence);
    while (matched) {
      pushes.push(matched[1]);
      matched = DEFINITION_RE.exec(sentence);
    }
    QUOTED_RE.lastIndex = 0;
    matched = QUOTED_RE.exec(sentence);
    while (matched) {
      pushes.push(matched[1]);
      matched = QUOTED_RE.exec(sentence);
    }
    for (const raw of pushes) {
      const name = raw.trim();
      if (!name || STOP_TERMS.has(name) || name.length < 2) continue;
      if (/[，。！？；、,.!?;]/.test(name)) continue;
      if (found.has(name)) continue;
      const definition = cleanDefinition(sentence, name);
      if (!definition) continue;
      found.set(name, { name, definition, sentence, source: 'material', order });
    }
  }
  return [...found.values()];
}

export function cleanDefinition(sentence: string, name: string): string {
  const index = sentence.indexOf(name);
  if (index < 0) return '';
  const tail = sentence.slice(index + name.length);
  const cleaned = tail
    .replace(/^[\s，,、:：]*/, '')
    .replace(/^(是指|指的是|是|指|就是|意味着|定义为)\s*/, '')
    .replace(/[。！？!?；;].*$/, '')
    .trim();
  if (charCount(cleaned) < 4) return '';
  return clampText(cleaned, 40);
}

export function parseSkeleton(raw: string): {
  name: string;
  definition: string;
  parent: string;
}[] {
  return normalizeText(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[|｜]/).map((item) => item.trim());
      return {
        name: parts[0] || '',
        definition: parts[1] || '',
        parent: parts[2] || ''
      };
    })
    .filter((item) => item.name);
}

export const QUESTION_RE = /[？?]|^(为什么|怎么|如何|是不是|有没有|哪一个|多少|凭什么|如果不)/;
export const CONCLUSION_RE =
  /(总之|一句话|说到底|归根结底|结论是|记住|这就是|真正的|最后看|落到)/;
export const GLOBAL_RE = /(这一章|本章|这一节|进入第|先看|接下来我们|最后我们|回到|从头|整章|全局|第一站|第二站|第三站)/;
export const EXAMPLE_RE =
  /(比如|例如|以.+为例|一家|一次|一位|数据显示|据.+统计|当年|想象|假设|场景里|真实案例|\d{4}\s*年|\d+%)/;
export const TRANSITION_RE =
  /^(所以|因此|于是|接下来|这说明|换句话说|与此同时|不过|但是|也就是说|回到|问题在于|关键是|正因为|顺着|由此可见)/;

export function isQuestion(text: string): boolean {
  return QUESTION_RE.test(text.trim());
}

export function isConclusion(text: string, isLast: boolean): boolean {
  if (CONCLUSION_RE.test(text)) return true;
  return isLast && /(最后|因此|所以)/.test(text);
}

export function isGlobal(text: string, isFirst: boolean): boolean {
  if (isFirst) return true;
  return GLOBAL_RE.test(text);
}

export function isExample(text: string): boolean {
  return EXAMPLE_RE.test(text);
}

export function isTransition(text: string): boolean {
  return TRANSITION_RE.test(text.trim());
}

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}