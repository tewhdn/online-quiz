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
    parts.push(`【题目】${q.stem}`);
    parts.push(`【选项】\n${q.options.map((option: QuestionOption) => `${option.key}. ${option.text}${chosen.has(option.key) ? '（学生选了这项）' : ''}`).join('\n')}`);
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

export interface ExplainResult {
  text: string;
  demo: boolean;
}

/**
 * 非流式调用 DeepSeek，一次拿回全文。
 * 前端拿到文本后本地做打字机动画，避免依赖 Workers 的流式转发。
 */
export async function explain(config: AppConfig, input: ExplainInput): Promise<ExplainResult> {
  if (!config.deepseekApiKey || !config.aiEnabled) {
    return { text: demoText(input), demo: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.aiTimeoutMs, 45_000));
  try {
    const response = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: buildMessages(input),
        stream: false,
        temperature: 0.5,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw ApiError.serviceUnavailable(`AI 服务返回异常（${response.status}）${detail ? `：${detail.slice(0, 120)}` : ''}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw ApiError.serviceUnavailable('AI 没有返回内容，请稍后重试');
    return { text, demo: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.serviceUnavailable('AI 服务暂时不可用，请稍后重试');
  } finally {
    clearTimeout(timer);
  }
}
