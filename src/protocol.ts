export type StationEvent = { type: string; entityId: string; payload: Record<string, unknown> };
export type Evidence = { id: string; text: string };
export type Retrieval = { entityIds: string[]; facts: Evidence[]; ambiguity: string[]; notice: string | null };
export type GraphSummary = { name: string; version: string; entities: number; facts: number };
export type BundleFile = { path: string; sha256: string; bytes: number };
export type Manifest = {
  schemaVersion: 1; id: string; name: string; model: string; revision: string;
  quantization: 'Q8_0' | 'Q4_0'; datasetVersion: string | null;
  files: Record<'weights' | 'tokenizer' | 'tokenizerConfig' | 'config' | 'generationConfig', BundleFile>;
  training: unknown; runtime: unknown;
};
export type Metrics = {
  inputTokens: number; outputTokens: number; firstTokenMs: number | null;
  totalMs: number; tokensPerSecond: number; droppedTurns: number; droppedFacts: number;
  backend: Record<string, unknown>; gpuDecodeVerified: boolean; wasmMemoryBytes: number;
  modelBytes: number; stopReason: string;
};
export type Request =
  | { type: 'init'; id: string; manifestUrl: string; backend: 'auto' | 'cpu'; files?: File[] }
  | { type: 'graph'; id: string; json: string }
  | { type: 'generate'; id: string; text: string; event?: StationEvent; retrieval: boolean }
  | { type: 'cancel'; id: string }
  | { type: 'reset'; id: string };
export type Response =
  | { type: 'progress'; id: string; message: string; percent?: number }
  | { type: 'ready'; id: string; manifest: Manifest; backend: Record<string, unknown>; cached: boolean; warning?: string }
  | { type: 'graph'; id: string; summary: GraphSummary }
  | { type: 'evidence'; id: string; retrieval: Retrieval; inputTokens: number; droppedTurns: number }
  | { type: 'chunk'; id: string; text: string }
  | { type: 'complete'; id: string; text: string; metrics: Metrics }
  | { type: 'reset'; id: string }
  | { type: 'error'; id: string; message: string; fatal: boolean };
