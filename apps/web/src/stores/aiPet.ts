import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { aiPetApi, type AiExplainInput } from '../api';

export interface AiPetMessage {
  id: number;
  role: 'pet' | 'user';
  text: string;
}

interface CurrentQuestion {
  id: string;
  stem: string;
  userAnswer?: string[];
}

interface AiPetScene {
  kind: 'practice' | 'exam';
  attemptId?: string;
  sessionId?: string;
}

export const useAiPetStore = defineStore('aiPet', () => {
  const open = ref(false);
  const busy = ref(false);
  const demoMode = ref(false);
  const messages = ref<AiPetMessage[]>([]);
  const question = ref<CurrentQuestion | null>(null);
  const bubble = ref('');
  const scene = ref<AiPetScene | null>(null);
  /** 考试场景下必须先确认「本题不计分」规则 */
  const examConfirmed = ref(false);
  const lastAssist = ref<'none' | 'wrongbook' | 'exam_void'>('none');
  /** 每次服务端返回辅助标记时 +1，便于界面重复提示 */
  const assistSeq = ref(0);

  let seq = 0;

  function pushMessage(role: 'pet' | 'user', text: string): AiPetMessage {
    const message = reactive<AiPetMessage>({ id: ++seq, role, text });
    messages.value.push(message);
    return message;
  }

  function toggle(value?: boolean): void {
    open.value = value ?? !open.value;
    if (open.value) {
      bubble.value = '';
      if (messages.value.length === 0) {
        pushMessage('pet', '我是鲸鱼娘～做题时哪里不明白，点我讲讲这道题，或者直接问我都可以。');
      }
    }
  }

  /** 设置当前场景：练习 / 考试 */
  function setScene(next: AiPetScene | null): void {
    scene.value = next;
    examConfirmed.value = false;
  }

  function confirmExamRule(): void {
    examConfirmed.value = true;
  }

  function contextFields(): { context?: 'practice' | 'exam'; attemptId?: string; sessionId?: string } {
    const current = scene.value;
    if (!current) return {};
    if (current.kind === 'exam') return { context: 'exam', attemptId: current.attemptId };
    return { context: 'practice', sessionId: current.sessionId };
  }

  /** 进入某道题时调用：告诉桌宠当前在做什么题 */
  function setQuestion(next: CurrentQuestion | null): void {
    question.value = next;
    if (next && !open.value) bubble.value = '这题不确定？点我讲讲～';
  }

  function updateUserAnswer(userAnswer: string[]): void {
    if (question.value) question.value = { ...question.value, userAnswer };
  }

  let typingTimer: ReturnType<typeof setInterval> | null = null;

  function cancelTyping(): void {
    if (typingTimer) {
      clearInterval(typingTimer);
      typingTimer = null;
    }
  }

  /** 本地打字机动画：把服务端返回的全文逐字显示出来 */
  function typeOut(message: AiPetMessage, full: string): Promise<void> {
    cancelTyping();
    return new Promise((resolve) => {
      let index = 0;
      const step = Math.max(2, Math.ceil(full.length / 90));
      message.text = '';
      typingTimer = setInterval(() => {
        index = Math.min(full.length, index + step);
        message.text = full.slice(0, index);
        if (index >= full.length) {
          cancelTyping();
          resolve();
        }
      }, 18);
    });
  }

  async function run(input: AiExplainInput, userText?: string): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    demoMode.value = false;
    if (userText) pushMessage('user', userText);
    const answer = pushMessage('pet', '');
    try {
      const { data } = await aiPetApi.explain({ ...contextFields(), ...input });
      demoMode.value = data.demo;
      lastAssist.value = data.assist;
      assistSeq.value += 1;
      await typeOut(answer, data.text || '（没有收到内容，请再试一次）');
    } catch (error) {
      answer.text = error instanceof Error ? error.message : '出错了，请稍后再试';
    } finally {
      busy.value = false;
    }
  }

  function explain(mode: 'explain' | 'simpler' | 'example' = 'explain'): Promise<void> {
    const current = question.value;
    if (!current) {
      return run({ questionText: '请介绍一下你自己，以及你能帮我做什么。' });
    }
    toggle(true);
    // 自动把当前题目作为提问内容带进去，学生不用手动输入
    const preview = current.stem.length > 42 ? `${current.stem.slice(0, 42)}…` : current.stem;
    const prefix = mode === 'simpler' ? '用更简单的话讲讲' : mode === 'example' ? '举个例子讲讲' : '帮我讲讲';
    return run({ questionId: current.id, userAnswer: current.userAnswer, mode }, `${prefix}：${preview}`);
  }

  function ask(text: string): Promise<void> {
    const value = text.trim();
    if (!value) return Promise.resolve();
    const current = question.value;
    toggle(true);
    return run(
      current
        ? { questionId: current.id, userAnswer: current.userAnswer, mode: 'explain', followUp: value }
        : { questionText: value },
      value,
    );
  }

  function resetQuestion(): void {
    question.value = null;
    bubble.value = '';
  }

  return {
    open,
    busy,
    demoMode,
    messages,
    question,
    bubble,
    scene,
    examConfirmed,
    lastAssist,
    assistSeq,
    toggle,
    setScene,
    confirmExamRule,
    setQuestion,
    updateUserAnswer,
    explain,
    ask,
    resetQuestion,
  };
});
