"""Render the measured comparison; never substitute native speeds for browser speeds."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    summaries=json.loads((ROOT/'artifacts/evaluation/test-summary.json').read_text())
    training=json.loads((ROOT/'artifacts/training/summary.json').read_text())
    validation=json.loads((ROOT/'artifacts/evaluation/validation-summary.json').read_text())
    selection=json.loads((ROOT/'reports/model-selection.json').read_text())
    browser=json.loads((ROOT/'reports/browser-tuned.json').read_text())
    audit=json.loads((ROOT/'reports/training-data-audit.json').read_text())
    selected=next(r for r in summaries if r['configuration']==selection['default']+'-retrieval')
    factual=['familiar_wording','held_out_entity','natural_wording','natural_held_out_entity']
    total=lambda row:sum(row['categories'][c]['count'] for c in factual)
    correct=lambda row:sum(row['categories'][c]['correct'] for c in factual)
    c=selected['categories']
    samples={id:next(r for r in browser[id]['cases'] if r['question']=='What room contains Nico?') for id in ['tuned-q4','tuned-q8']}
    lines=['# Local browser POC comparison','',
           f"The selected {selection['default']} model with Rust retrieval scored **{correct(selected)}/{total(selected)} factual answers, {c['unknown']['correct']}/{c['unknown']['count']} appropriate unknown answers and {c['event']['correct']}/{c['event']['count']} event responses**. These are narrow synthetic results, not a general capability claim.",'',
           '## Held-out comparison','',
           '| Configuration | Record-style familiar | Record-style held-out | Natural familiar | Natural held-out | Unknown facts | Events | Unsupported flags | Weights |',
           '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for row in summaries:
        c=row['categories']
        cell=lambda k:f"{c[k]['correct']}/{c[k]['count']} ({c[k]['accuracy']:.0%})"
        lines.append(f"| {row['configuration']} | {cell('familiar_wording')} | {cell('held_out_entity')} | {cell('natural_wording')} | {cell('natural_held_out_entity')} | {cell('unknown')} | {cell('event')} | {row['unsupportedFlagRate']:.1%} | {row['artifactBytes']/1e6:.1f} MB |")
    lines += ['', f"Every configuration uses the same {selected['count']} questions and grounded-answer instruction. Disabling retrieval leaves that instruction unchanged; the tuned model generally abstains rather than relying on memorization. This is an application ablation, not a neutral test of unconstrained closed-book recall. Ambiguity and unsupported events each have only one example.",'',
              'Unsupported assertion flags are automated indicators for unmatched names/numbers, answering missing facts and claimed actions. Zero flags is not proof of zero hallucinations. Exact-value grading can miss contradictions or under-credit paraphrases. Raw outputs are retained for review.','',
              '## Validation and quantization','',
              f"Selection used separate factual and unknown-answer validation plus browser runtime checks bound to each exact model and patch hash. Q8 factual validation was {selection['q8FactualAccuracy']:.2%}; Q4 was {selection['q4FactualAccuracy']:.2%}. Their difference is {selection['quantizationLossPercentagePoints']:.2f} percentage points, against the agreed two-point quantization limit. Selected default: {selection['default']}. Test scores did not control selection.",'',
              'Q4_0 is the pinned llama.cpp standard recipe: layer matrices are Q4_0, while the tied embedding/output matrix falls back to Q8_0 because its width is incompatible with the preferred embedding quantizer. Norm weights are F32. These actual exported files were evaluated.','',
              'In the browser, the compatibility patch expands Q4_0 blocks losslessly into Q8_0 storage for Flare’s CPU prefill and GPU decoding. Scales and decoded values are unchanged. This avoids the original empty-float-weight panic, but Q4’s smaller download does not deliver a proportional runtime memory saving.','',
              '## Training','',
              f"Dataset {training['dataset']['version']} contains {training['dataset']['examples']['train']:,} training chats, {training['dataset']['examples']['valid']:,} validation chats and {training['dataset']['examples']['test']:,} training-format test chats. The graph has 100 entities and 500 facts. Training and validation retrieval exclude held-out test entities; training also excludes validation entities and incident relationships. Familiar wording templates and event payloads are separated before expansion.", '',
              f"A fresh 600-update MLX-LM LoRA run used rank 16, learning rate 1e-4, batch 4, sequence cap 1,024 and prompt masking. It took {training['elapsedSeconds']:.1f} seconds with {training['peakMemoryGB']:.2f} GB peak MLX memory. The lowest validation loss was {training['bestValidationLoss']:.6f} at {training['bestStep']} completed updates; those weights were fused. Validation uses every complete batch ({training['dataset']['examples']['valid']//4*4}/{training['dataset']['examples']['valid']} examples). The maximum audited example length is {max(r['maxTokens'] for r in audit.values())} tokens.", '',
              'The first experiment reached excellent factual validation but 0/8 unknown-answer correctness. Version 1.1 added missing-property diversity and examples where the requested fact is deliberately removed from otherwise relevant evidence. The first experiment remains in `artifacts/round-1/`. Version 1.2 addresses a further gap found in the actual app: v1.1 passed record-style questions but abstained on ordinary wording such as “Where is the oxygen sensor?” Version 1.2 adds natural forms, lower-case labels, aliases and follow-ups. Natural train/validation/test wording families were assigned before expansion. Earlier record-style test outputs had already been inspected; those scores should be treated as a fixed regression set. The natural subset adds fresh reserved wording. No final-test questions were added to training. Round 2 artifacts remain in `artifacts/round-2/`.','',
              '## Runtime and performance','',
              'Browser inference uses patched Flare in a dedicated worker; Rust retrieval is a separate WASM module. The original tokenizer/template configuration is preserved. CPU prefill precedes asynchronous WebGPU decoding. The repaired base runtime matched reference tokens/text on eight deterministic prompts in all four CPU/GPU and regular/healed combinations. Tuned-browser checks and observed timings are in [browser-tuned.json](browser-tuned.json); broader UI, recovery and offline checks are in [browser-integration.md](browser-integration.md).','',
              'The expanded check found that Flare ignored the external JSON pre-tokenizer, changing token boundaries around blank lines and digits. The patch now implements the selected model’s Digits + ByteLevel pipeline. Actual compiled WASM matches native Rust retrieval, the original chat template and all 119,802 reference token IDs across 698 prompts; 47 additional fixtures match the original Hugging Face tokenizer. This is library-level parity, separately complemented by real-browser GPU generation. See [tokenizer-parity.json](tokenizer-parity.json).','',
              'Native llama.cpp performs the quality evaluation against the actual GGUF artifacts, using greedy decoding, the original template and the same Rust retrieval output. Its throughput is recorded in the raw results and must not be described as browser WebGPU speed. Browser timing depends on prompt length, warmup, foreground/background scheduling and other GPU use. Model parsing and cache verification are excluded from per-turn timings.','',
              'Comparable browser observations below used “What room contains Nico?” with 278 input and six output tokens. These are single runs, not a latency distribution.','',
              '| Model | First token | Decode | WASM heap |','|---|---:|---:|---:|',
              *[f"| {id} | {r['firstTokenSeconds']:.2f} s | {r['decodeTokensPerSecond']:.1f} tokens/s | {r['wasmHeapMB']:,} MB |" for id,r in samples.items()],'',
              'Observable memory is the Flare WASM heap, not total browser or GPU memory. A base Q8 sample used a 2,013 MB WASM heap. Although weights are small, this prototype is not a sub-gigabyte browser process: Flare allocates a larger internal KV capacity than the app’s 2,048-token budget. This remains a useful optimization target.','',
              '## Scope and limits','',
              'The corpus is fictional, the answers are short and templated, and the graph covers a narrow domain. Held-out entities test retrieval and copying more than open-ended reasoning. General chat, real-world knowledge, adversarial robustness, other model architectures, mobile browsers and hardware without WebGPU have not been established by this result. Unavailable-GPU branches were unit-tested and actual CPU generation was verified; this Mac has a working GPU.','',
              'The natural-language misses were two room-owner questions phrased “Whose responsibility is …?” Event failures included an unsupported interpretation of an alert (Q8), abstention on visitor messages (Q4), and substitution of persistent stock for the temporary event count (Q4). Events only produce text and never execute actions, but their correctness remains a concrete improvement target. The agreed 90% acceptance thresholds apply to factual and unknown-answer questions; no 90% event claim is made.','',
              'Prompts and graphs remain local. The browser works after network-disabled reload, and an observed event generated no page requests. Source review constrains worker file reads to the same origin; the page request trace alone does not cover every worker-internal request. No site was deployed and the upstream issue draft was not posted.','',
              '## Reproducible artifacts','',
              '- [Training guide](../docs/training.md), [graph schema and examples](../docs/graph-format.md), [data audit](training-data-audit.json).',
              '- Raw questions, predictions, evidence, token IDs and native timings: `artifacts/evaluation/test-*.json` and `validation-*.json`.',
              '- Training configuration, losses, best/periodic adapters and fused weights: `artifacts/training/`.',
              '- Portable manifests, original tokenizer/configuration and weights: `artifacts/bundles/tuned-q8/` and `tuned-q4/`.',
              '- [Default selection evidence](model-selection.json).','']
    (ROOT/'reports/comparison.md').write_text('\n'.join(lines))
    (ROOT/'reports/comparison.json').write_text(json.dumps({'test':summaries,'validation':validation,'training':{k:training[k] for k in ['stepsCompleted','bestStep','bestValidationLoss','elapsedSeconds','peakMemoryGB']},'dataset':training['dataset']['version'],'selection':selection,'browser':browser},indent=2)+'\n')
if __name__=='__main__':main()
