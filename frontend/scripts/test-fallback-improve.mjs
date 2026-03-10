#!/usr/bin/env node
import { _testHelpers } from "../pages/api/ai/helpers/smartAiHelpers.js";

const { fallbackImprove, fixShortSentence } = _testHelpers;

const cases = [
  ["my name tharun", "My name is Tharun."],
  ["what your name", "What is your name?"],
  ["today tuesday", "Today is Tuesday."],
  ["todayi s tuesday", "Today is Tuesday."],
  ["i good boy", "I am a good boy."],
  ["i good", "I am good."],
  ["this not good", "This is not good."],
  ["we ready", "We are ready."],
  ["they busy", "They are busy."]
];

let pass = 0;
for (const [input, expected] of cases) {
  const output = fallbackImprove(input);
  const ok = output === expected;
  if (ok) pass += 1;
  console.log(`${ok ? "✓" : "✗"} "${input}" -> "${output}" (expected "${expected}")`);
}

console.log(`\n${pass}/${cases.length} cases passed`);
