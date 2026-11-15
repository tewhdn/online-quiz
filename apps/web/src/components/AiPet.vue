<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useAiPetStore } from '../stores/aiPet';
import { useToast } from '../composables/useToast';

const pet = useAiPetStore();
const toast = useToast();
const draft = ref('');
const listEl = ref<HTMLElement | null>(null);

const POS_KEY = 'oq:pet-pos:v1';
const PET_W = 92;
const PET_H = 112;

const position = reactive({ x: 0, y: 0 });
const dragging = ref(false);
const panelAbove = ref(true);
let dragOrigin = { px: 0, py: 0, x: 0, y: 0, moved: false };

const quickActions = [
  { mode: 'explain' as const, label: '讲讲这题' },
  { mode: 'simpler' as const, label: '再简单点' },
  { mode: 'example' as const, label: '举个例子' },
];

const questionPreview = computed(() => {
  const stem = pet.question?.stem ?? '';
  return stem.length > 46 ? `${stem.slice(0, 46)}…` : stem;
});

const rootStyle = computed(() => ({ left: `${position.x}px`, top: `${position.y}px` }));
const panelStyle = computed(() =>
  panelAbove.value
    ? { bottom: 'calc(100% + 10px)', [position.x > window.innerWidth / 2 ? 'right' : 'left']: '0' }
    : { top: 'calc(100% + 10px)', [position.x > window.innerWidth / 2 ? 'right' : 'left']: '0' },
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function applyPosition(x: number, y: number): void {
  position.x = clamp(x, 8, window.innerWidth - PET_W - 8);
  position.y = clamp(y, 60, window.innerHeight - PET_H - 12);
  panelAbove.value = position.y > window.innerHeight * 0.42;
}

function resetPosition(): void {
  applyPosition(window.innerWidth - PET_W - 16, window.innerHeight - PET_H - 88);
}

function savePosition(): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: position.x, y: position.y }));
  } catch {
    // 忽略存储失败
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== undefined && event.button !== 0) return;
  dragging.value = true;
  dragOrigin = { px: event.clientX, py: event.clientY, x: position.x, y: position.y, moved: false };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  const dx = event.clientX - dragOrigin.px;
  const dy = event.clientY - dragOrigin.py;
  if (Math.abs(dx) + Math.abs(dy) > 5) dragOrigin.moved = true;
  applyPosition(dragOrigin.x + dx, dragOrigin.y + dy);
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  if (dragOrigin.moved) {
    savePosition();
  } else {
    pet.toggle();
  }
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

watch(() => pet.messages.length, scrollToBottom);
watch(
  () => pet.assistSeq,
  () => {
    if (pet.lastAssist === 'wrongbook') toast.info('已加入错题本，之后可以在「错题本」里复习');
    else if (pet.lastAssist === 'exam_void') toast.info('已记录：本题为 AI 辅助，交卷时不计分');
  },
);
watch(() => pet.messages[pet.messages.length - 1]?.text, scrollToBottom);

function send(): void {
  const text = draft.value;
  draft.value = '';
  void pet.ask(text);
}

function onResize(): void {
  applyPosition(position.x, position.y);
}

onMounted(() => {
  let saved: { x: number; y: number } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    applyPosition(saved.x, saved.y);
  } else {
    resetPosition();
  }
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div class="ai-pet-root" :style="rootStyle" :class="{ dragging }">
    <transition name="pet-pop">
      <div v-if="!pet.open" class="pet-float-wrap">
        <button v-if="pet.bubble" class="pet-bubble" type="button" @click="pet.toggle(true)">
          {{ pet.bubble }}
        </button>
        <button
          class="pet-float"
          :class="{ thinking: pet.busy }"
          type="button"
          aria-label="鲸鱼娘 AI 助教（可拖动）"
          @pointerdown.prevent="onPointerDown"
          @pointermove.prevent="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <img src="/pet/pet-body.png" alt="鲸鱼娘" draggable="false" />
          <span class="pet-badge">AI</span>
        </button>
      </div>
    </transition>

    <transition name="pet-sheet">
      <section v-if="pet.open" class="pet-panel" :style="panelStyle" aria-label="鲸鱼娘 AI 助教">
        <header class="pet-head">
          <img class="pet-avatar" src="/pet/pet-avatar.png" alt="" />
          <div class="pet-head-text">
            <strong>鲸鱼娘 · AI 助教</strong>
            <span>{{ pet.demoMode ? '演示模式（未配置 API Key）' : 'DeepSeek 驱动 · 只讲题，不乱编' }}</span>
          </div>
          <button class="pet-close" type="button" aria-label="收起" @click="pet.toggle(false)">×</button>
        </header>

        <div v-if="pet.question" class="pet-context">
          <span class="ctx-tag">当前题目</span>
          <span class="ctx-stem">{{ questionPreview }}</span>
        </div>

        <div v-if="pet.scene?.kind === 'exam'" class="pet-warn">
          <strong>考试中询问 AI：本题不计分</strong>
          <span>交卷时该题按 0 分计，并加入错题本。</span>
          <button v-if="!pet.examConfirmed" type="button" class="warn-ok" @click="pet.confirmExamRule()">我已了解，继续</button>
        </div>

        <div ref="listEl" class="pet-body">
          <div v-for="message in pet.messages" :key="message.id" class="pet-msg" :class="message.role">
            <img v-if="message.role === 'pet'" class="msg-avatar" src="/pet/pet-avatar.png" alt="" />
            <p class="msg-text">{{ message.text || (pet.busy ? '让我想想…' : '') }}</p>
          </div>
        </div>

        <div v-if="pet.question" class="pet-quick">
          <button
            v-for="action in quickActions"
            :key="action.mode"
            class="chip"
            type="button"
            :disabled="pet.busy || (pet.scene?.kind === 'exam' && !pet.examConfirmed)"
            @click="pet.explain(action.mode)"
          >
            {{ action.label }}
          </button>
        </div>

        <form class="pet-input" @submit.prevent="send">
          <input
            v-model="draft"
            type="text"
            :placeholder="pet.question ? '针对这道题追问，会自动带上题目…' : '有什么不懂的，问我…'"
            maxlength="200"
            :disabled="pet.busy"
          />
          <button type="submit" class="send" :disabled="pet.busy || !draft.trim()">发送</button>
        </form>
        <p class="pet-foot">
          <button type="button" class="reset-pos" @click="resetPosition">桌宠归位</button>
          <span>AI 生成内容仅供参考</span>
        </p>
      </section>
    </transition>
  </div>
</template>

<style scoped>
.ai-pet-root {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 60;
  width: 92px;
  height: 112px;
  pointer-events: none;
}
.ai-pet-root.dragging {
  cursor: grabbing;
}
.pet-float-wrap {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: 92px;
}
.pet-bubble {
  max-width: 180px;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  background: var(--surface-solid, #fff);
  color: var(--ink, #1f2328);
  border-radius: 14px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  box-shadow: 0 8px 24px rgba(15, 30, 60, 0.12);
  cursor: pointer;
  animation: pet-bubble-in 0.25s ease;
  align-self: flex-end;
}
.pet-float {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0;
  width: 92px;
  height: 112px;
  cursor: grab;
  touch-action: none;
  animation: pet-bob 3.2s ease-in-out infinite;
  user-select: none;
  -webkit-user-select: none;
}
.pet-float:active {
  cursor: grabbing;
}
.pet-float img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 10px 18px rgba(20, 40, 90, 0.25));
  transition: transform 0.2s ease;
  pointer-events: none;
}
.pet-float:hover img {
  transform: translateY(-3px) scale(1.03);
}
.pet-float.thinking img {
  animation: pet-wobble 0.9s ease-in-out infinite;
}
.pet-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #2f6df6;
  border-radius: 999px;
  padding: 2px 6px;
  box-shadow: 0 2px 6px rgba(47, 109, 246, 0.4);
  pointer-events: none;
}

.pet-panel {
  pointer-events: auto;
  position: absolute;
  width: min(380px, calc(100vw - 24px));
  max-height: min(64vh, 560px);
  display: flex;
  flex-direction: column;
  background: var(--surface-solid, #fff);
  color: var(--ink, #1f2328);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(15, 30, 60, 0.22);
  overflow: hidden;
}
.pet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));
  background: linear-gradient(120deg, rgba(47, 109, 246, 0.09), rgba(47, 109, 246, 0));
}
.pet-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(47, 109, 246, 0.25);
  background: #e8f0ff;
}
.pet-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.pet-head-text strong {
  font-size: 14px;
}
.pet-head-text span {
  font-size: 11px;
  color: var(--muted, #6b7480);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pet-close {
  border: 0;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--muted, #6b7480);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 8px;
}
.pet-close:hover {
  background: var(--surface-3, #f0eee8);
}
.pet-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 12px 0;
  padding: 6px 9px;
  border-radius: 10px;
  background: rgba(47, 109, 246, 0.07);
  border: 1px solid rgba(47, 109, 246, 0.16);
  font-size: 11px;
  min-width: 0;
}
.ctx-tag {
  flex: 0 0 auto;
  color: #2f6df6;
  font-weight: 600;
}
.ctx-stem {
  color: var(--muted, #6b7480);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pet-warn {
  margin: 8px 12px 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(230, 120, 30, 0.35);
  background: rgba(230, 120, 30, 0.09);
  font-size: 11px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pet-warn strong {
  color: #c8681a;
  font-size: 12px;
}
.pet-warn span {
  color: var(--muted, #6b7480);
}
.warn-ok {
  align-self: flex-start;
  margin-top: 4px;
  border: 0;
  border-radius: 8px;
  background: #e6781e;
  color: #fff;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}
.pet-body {
  padding: 10px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 110px;
}
.pet-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.pet-msg.user {
  justify-content: flex-end;
}
.msg-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex: 0 0 auto;
  margin-top: 2px;
}
.msg-text {
  margin: 0;
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 82%;
  background: var(--surface-2, #faf9f6);
}
.pet-msg.user .msg-text {
  background: rgba(47, 109, 246, 0.12);
  color: inherit;
}
.pet-quick {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid rgba(47, 109, 246, 0.28);
  background: rgba(47, 109, 246, 0.06);
  color: var(--ink, #1f2328);
  border-radius: 999px;
  font-size: 12px;
  padding: 5px 11px;
  cursor: pointer;
}
.chip:hover:not(:disabled) {
  background: rgba(47, 109, 246, 0.14);
}
.chip:disabled {
  opacity: 0.5;
  cursor: default;
}
.pet-input {
  display: flex;
  gap: 8px;
  padding: 8px 12px 4px;
  border-top: 1px solid var(--line, rgba(0, 0, 0, 0.06));
}
.pet-input input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  background: var(--surface-2, #faf9f6);
  color: inherit;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}
.pet-input input:focus {
  border-color: rgba(47, 109, 246, 0.45);
}
.send {
  border: 0;
  background: #2f6df6;
  color: #fff;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.45;
  cursor: default;
}
.pet-foot {
  margin: 0;
  padding: 2px 14px 10px;
  font-size: 10px;
  color: var(--muted, #6b7480);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.reset-pos {
  border: 0;
  background: transparent;
  color: #2f6df6;
  font-size: 10px;
  cursor: pointer;
  padding: 0;
}

@keyframes pet-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes pet-wobble {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
}
@keyframes pet-bubble-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.pet-pop-enter-active, .pet-pop-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.pet-pop-enter-from, .pet-pop-leave-to { opacity: 0; transform: translateY(8px) scale(0.96); }
.pet-sheet-enter-active, .pet-sheet-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.pet-sheet-enter-from, .pet-sheet-leave-to { opacity: 0; transform: translateY(14px) scale(0.98); }

@media (max-width: 640px) {
  .pet-panel {
    width: min(360px, calc(100vw - 20px));
    max-height: 62vh;
  }
}
</style>
