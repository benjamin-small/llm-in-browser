import type { Retrieval } from './protocol';
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
// Exact SmolLM2 chat template, with an explicit system turn and no extra BOS.
export function chatTemplate(messages: Message[]): string {
  return messages.map(m => `<|im_start|>${m.role}\n${safeContent(m.content)}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
}
export function safeContent(s: string): string { return s.replaceAll('<|', '‹|').replaceAll('|>', '|›'); }
export function renderRequest(question: string, result: Retrieval): string {
  let context = result.facts.map(f => `[${f.id}] ${f.text}`).join('\n') || '(No matching facts.)';
  if (result.ambiguity.length) context += '\nAmbiguous name. Candidates: ' + result.ambiguity.join(', ') + '. Ask which one.';
  if (result.notice) context += '\n' + result.notice;
  return `Evidence:\n${safeContent(context)}\n\nRequest: ${safeContent(question)}`;
}
export function boundPrompt(system: string, history: Message[], question: string, retrieval: Retrieval, encode: (s: string)=>Uint32Array) {
  const kept = history.slice();
  const result = structuredClone(retrieval);
  let droppedTurns = 0, droppedFacts = 0;
  const build = () => chatTemplate([{role:'system',content:system}, ...kept, {role:'user',content:renderRequest(question,result)}]);
  let ids = encode(build());
  while (ids.length > 1792 && kept.length) { kept.splice(0,2); droppedTurns++; ids=encode(build()); }
  while (ids.length > 1792 && result.facts.length) { result.facts.pop(); droppedFacts++; ids=encode(build()); }
  if (ids.length > 1792) throw new Error('This request is too long for the 2,048-token context. Shorten it and retry.');
  return { ids, kept, retrieval: result, droppedTurns, droppedFacts };
}
