<script setup lang="ts">
import type { QuestionOption } from '../types';

const props = withDefaults(
  defineProps<{
    options: QuestionOption[];
    modelValue: string[];
    multiple?: boolean;
    disabled?: boolean;
    type?: string;
    result?: { correctAnswer: string[]; userAnswer: string[]; isCorrect: boolean } | null;
  }>(),
  { multiple: false, disabled: false, type: 'single', result: null },
);
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>();

function toggle(key: string): void {
  if (props.disabled) return;
  if (props.multiple) {
    const next = props.modelValue.includes(key)
      ? props.modelValue.filter((item) => item !== key)
      : [...props.modelValue, key];
    emit('update:modelValue', next);
  } else {
    emit('update:modelValue', [key]);
  }
}

function stateOf(key: string): string {
  if (!props.result) return props.modelValue.includes(key) ? 'selected' : '';
  const correct = props.result.correctAnswer.map((item) => item.toLowerCase());
  const chosen = props.result.userAnswer.map((item) => item.toLowerCase());
  if (correct.includes(key.toLowerCase())) return 'correct';
  if (chosen.includes(key.toLowerCase())) return 'wrong';
  return '';
}

const booleanOptions = [
  { key: 'true', text: '正确' },
  { key: 'false', text: '错误' },
];

const displayOptions = (): QuestionOption[] => {
  if (props.type === 'boolean' && props.options.length === 0) return booleanOptions;
  return props.options;
};
</script>

<template>
  <div class="option-list" role="group" aria-label="选项">
    <button
      v-for="option in displayOptions()"
      :key="option.key"
      type="button"
      class="option"
      :class="stateOf(option.key)"
      :disabled="disabled"
      :aria-pressed="modelValue.includes(option.key)"
      @click="toggle(option.key)"
    >
      <span class="option-key">{{ type === 'boolean' ? (option.key === 'true' ? '✓' : '✕') : option.key }}</span>
      <span class="option-text">{{ option.text }}</span>
    </button>
  </div>
</template>
