import { ApiError } from '../utils/errors.ts';
import type { AppConfig } from '../utils/config.ts';
import type { QuestionOption, QuestionRecord } from '../types/models.ts';

const PERSONA = `你是「鲸鱼娘·大肥鱼」，一位亲切的计算机/信息技术学习助教。
要求：
1. 用简体中文口语化讲解，总长度控制在 200 字以内，最多 3 个要点，不要用 Markdown 标题。
2. 讲题时先给结论（哪个选项对），再解释为什么对、其他选项错在哪、这类题的易错点。
3. 只围绕用户给的题目或问题，不要自己出新题，不要编造题目之外的知识点；不确定就直说。
4. 语气温柔有耐心，可以偶尔用「我们」「一起看看」；不要卖萌到影响理解。`;

export type ExplainMode = 'explain' | 'simpler' | 'example';

export interface ExplainInput {
  question?: QuestionRecord;
  questionText?: string;
  userAnswer?: string[];
  mode?: ExplainMode;
  followUp?: string;
}

const MODE_HINT: Record<ExplainMode, string> = {
  explain: '请正常讲解这道题。',
  simpler: '请用更通俗、更短的话解释，面向基础薄弱的学生。',
  example: '请结合一个生活中的小例子解释。',
};

export function buildMessages(input: ExplainInput): Array<{ role: 'system' | 'user'; content: string }> {
  const parts: string[] = [];
  if (input.question) {
    const q = input.question;
    const chosen = new Set(input.userAnswer ?? []);
    const optionLines = q.options
      .map((option: QuestionOption) => `${option.key}. ${option.text}${chosen.has(option.key) ? '（学生选了这项）' : ''}`)
      .join('\n');
    parts.push(`【题目】${q.stem}`);
    parts.push(`【选项】\n${optionLines}`);
    parts.push(`【正确答案】${q.answer.join(', ')}`);
    if (q.explanation) parts.push(`【题库解析参考】${q.explanation}`);
    if (q.knowledgePoints.length) parts.push(`【知识点】${q.knowledgePoints.join('、')}`);
    parts.push(MODE_HINT[input.mode ?? 'explain']);
  } else if (input.questionText) {
    parts.push(`【学生的问题】${input.questionText}`);
    parts.push('请用简短易懂的方式回答，必要时给出一个小例子。');
  }
  if (input.followUp) parts.push(`【学生的追问】${input.followUp}`);
  return [
    { role: 'system', content: PERSONA },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** 无 Key / 关闭时的演示输出：用题库解析兜底，保证前端交互可验收。 */
function demoText(input: ExplainInput): string {
  if (input.question) {
    const correct = input.question.options.filter((option: QuestionOption) => input.question!.answer.includes(option.key));
    return [
      `这道题选 ${input.question.answer.join('、')}。`,
      correct.length ? `${correct.map((o: QuestionOption) => `${o.key}. ${o.text}`).join('；')} 正是题目要考的点。` : '',
      input.question.explanation || '题库里暂无解析，建议对照教材相关章节再看一遍。',
      '（演示模式：当前未配置 DeepSeek API Key，以上是题库解析兜底内容）',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return '（演示模式：当前未配置 DeepSeek API Key，配置后我就能真正回答你的问题啦）';
}

/** 把 DeepSeek 的流式响应转换成前端 SSE：{"type":"delta"|"done"|"error"} */
function toClientStream(upstream: Response, onDone: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return new ReadableStream<Uint8Array>({
    async pull(out) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          onDone();
          out.enqueue(encoder.encode(sseLine({ type: 'done' })));
          out.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const text = parsed.choices?.[0]?.delta?.content;
            if (text) out.enqueue(encoder.encode(sseLine({ type: 'delta', text })));
          } catch {
            // 忽略心跳等非 JSON 行
          }
        }
      } catch {
        onDone();
        out.enqueue(encoder.encode(sseLine({ type: 'error', message: 'AI 输出中断，请重试' })));
        out.close();
      }
    },
    cancel() {
      onDone();
      reader.cancel().catch(() => undefined);
    },
  });
}

export interface StreamResult {
  stream: ReadableStream<Uint8Array>;
  demo: boolean;
}

export async function streamExplain(config: AppConfig, input: ExplainInput): Promise<StreamResult> {
  const encoder = new TextEncoder();
  if (!config.deepseekApiKey || !config.aiEnabled) {
    // 演示模式：把兜底解析按字符分片推送，方便验收打字机效果
    const full = demoText(input);
    let cursor = 0;
    const demo = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 18));
        if (cursor >= full.length) {
          controller.enqueue(encoder.encode(sseLine({ type: 'done', demo: true })));
          controller.close();
          return;
        }
        const chunk = full.slice(cursor, cursor + 6);
        cursor += chunk.length;
        controller.enqueue(encoder.encode(sseLine({ type: 'delta', text: chunk })));
      },
    });
    return { stream: demo, demo: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  let upstream: Response;
  try {
    upstream = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: buildMessages(input),
        stream: true,
        temperature: 0.5,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw ApiError.serviceUnavailable('AI 服务暂时不可用，请稍后重试');
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const detail = await upstream.text().catch(() => '');
    throw ApiError.serviceUnavailable(`AI 服务返回异常（${upstream.status}）${detail ? `：${detail.slice(0, 120)}` : ''}`);
  }

  return { stream: toClientStream(upstream, () => clearTimeout(timer)), demo: false };
}
