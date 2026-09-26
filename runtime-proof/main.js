const element = id => document.getElementById(id);
const statusLine = element('status');
const options = new URLSearchParams(location.search);
const mode = options.get('mode') || 'async';
const tokenizerMode = options.get('tokenizer') || 'external';
let worker, timer, ready = false, busy = false, startedAt, lastActivity;
let runtimeDiagnostics = [];

function controls() {
  for (const backend of ['gpu', 'cpu']) element(backend).disabled = !ready || busy;
  element('stop').disabled = !busy;
  element('check').disabled = busy;
}

async function checkSetup() {
  ready = false;
  controls();
  element('checks').replaceChildren();
  element('setup').textContent = 'Checking the local servers and model files…';
  if (!['http:', 'https:'].includes(location.protocol)) {
    element('setup').textContent = 'This page was opened as a file. Run npm run dev, then open http://127.0.0.1:8787/.';
    statusLine.textContent = 'A local HTTP server is required to load the WASM worker.';
    return;
  }
  try {
    const response = await fetch('/api/status', {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Local setup endpoint returned HTTP ' + response.status);
    const setup = await response.json();
    const checks = [...setup.assets, {name: 'Local reference server', ready: setup.referenceReady, command: 'npm run dev'}];
    for (const check of checks) {
      const item = document.createElement('li');
      item.textContent = (check.ready ? '✓ ' : 'Missing: ') + check.name;
      if (!check.ready) { item.className = 'missing'; item.textContent += ' — run ' + check.command; }
      element('checks').append(item);
    }
    ready = setup.ready;
    element('setup').textContent = ready ? 'Local servers and model files are ready.' : 'Setup needs attention. Follow the commands below, then check again.';
    if (!busy) statusLine.textContent = ready ? 'Ready. Choose WebGPU or CPU to run the eight-prompt comparison.' : 'Cannot run until local setup is ready.';
  } catch (error) {
    element('setup').textContent = 'Cannot reach the local proof server. Run npm run dev and open http://127.0.0.1:8787/.';
    statusLine.textContent = error.message;
  }
  controls();
}

function finish() {
  worker?.terminate(); worker = undefined;
  clearInterval(timer);
  if (startedAt) element('elapsed').textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)} seconds elapsed.`;
  busy = false;
  element('progress').hidden = true;
  controls();
}

function failure(message, backend, extra = {}) {
  if (runtimeDiagnostics.length) message += '\n\n' + runtimeDiagnostics.join('\n');
  const result = {kind: 'error', requestedBackend: backend, mode, tokenizerMode, ...extra, message, diagnostics: runtimeDiagnostics, browser: navigator.userAgent};
  finish();
  statusLine.textContent = 'Diagnostic failed to run.';
  statusLine.dataset.state = 'failed';
  element('error').hidden = false;
  element('error').textContent = message;
  showRaw(result);
  document.body.dataset.done = 'error';
}

function showRaw(result) {
  window.proofResult = result;
  element('results').hidden = false;
  element('output').textContent = JSON.stringify(result, null, 2);
}

function showResults(result) {
  showRaw(result);
  const passed = result.cases.filter(item => item.smokePassed).length;
  element('summary').textContent = `${passed} / ${result.cases.length} expected answers. Backend reported: ${result.backend?.backend || 'unknown'}. ` +
    (result.gatePassed ? 'The runtime smoke checks passed.' : 'The correctness gate failed; this build is not ready for chat.');
  for (const item of result.cases) {
    const card = document.createElement('article'); card.className = 'case';
    const title = document.createElement('h3'); title.textContent = item.user;
    const answers = document.createElement('dl');
    const repeatedEndToken = item.outputTokens?.length > 0 && item.outputTokens.every(id => id === 0) && item.output === '<|endoftext|>'.repeat(item.outputTokens.length);
    const displayedOutput = repeatedEndToken ? `No answer generated. Repeated <|endoftext|> ${item.outputTokens.length} times.` : item.output || '(No text generated)';
    for (const [label, text] of [['Local reference', item.referenceText], ['Flare output', displayedOutput]]) {
      const key = document.createElement('dt'); key.textContent = label;
      const value = document.createElement('dd'); value.textContent = text;
      answers.append(key, value);
    }
    const meta = document.createElement('p'); meta.className = 'meta';
    meta.textContent = `Tokenizer ${item.tokenizerMatches ? 'matches' : 'mismatch'} · Template ${item.templateMatches ? 'matches' : 'mismatch'} · ` +
      `Output tokens ${item.referenceOutputTokensMatch ? 'match reference' : 'differ from reference'} · ` +
      `Nonzero logits: ${item.firstLogits?.nonzero ?? 'unavailable'} · First token: ${item.firstTokenMs?.toFixed(0) ?? '—'} ms`;
    card.append(title, answers, meta); element('cases').append(card);
  }
}

async function run(backend) {
  if (busy || !ready) return;
  delete document.body.dataset.done;
  delete window.proofResult;
  runtimeDiagnostics = [];
  element('results').hidden = true;
  element('error').hidden = true;
  element('cases').replaceChildren();
  for (const id of ['output', 'stream', 'summary', 'save-status', 'elapsed']) element(id).textContent = '';
  element('stream').hidden = true;
  statusLine.dataset.state = '';
  statusLine.textContent = 'Starting the ' + backend.toUpperCase() + ' worker…';
  busy = true;
  startedAt = lastActivity = performance.now();
  controls();
  timer = setInterval(() => {
    element('elapsed').textContent = `${Math.floor((performance.now() - startedAt) / 1000)} seconds elapsed. You can stop this diagnostic at any time.`;
    if (performance.now() - lastActivity > 180000) failure('No worker progress for 3 minutes. Stop other GPU-heavy work, reload this page, and retry. See artifacts/runtime-proof/dev-*.log for local server errors.', backend);
  }, 1000);
  try {
    worker = new Worker(new URL('./worker.js', location.href), {type: 'module'});
    worker.onerror = event => {
      event.preventDefault();
      failure(event.message || 'The worker could not load. Run npm run dev, then reload http://127.0.0.1:8787/. If files are missing, run npm run proof:build.', backend,
        {filename: event.filename, line: event.lineno});
    };
    worker.onmessageerror = () => failure('The worker returned an unreadable message. Reload this page and retry.', backend);
    worker.onmessage = async ({data}) => {
      lastActivity = performance.now();
      if (data.kind === 'diagnostic') runtimeDiagnostics.push(data.message);
      if (data.kind === 'progress') {
        statusLine.textContent = data.message;
        element('progress').hidden = data.percent === undefined;
        if (data.percent !== undefined) element('progress').value = data.percent;
      }
      if (data.kind === 'token') { element('stream').hidden = false; element('stream').textContent += data.text; }
      if (data.kind === 'error') failure(data.message, backend, data);
      if (data.kind === 'result') {
        finish();
        element('stream').hidden = true;
        showResults({...data, browser: navigator.userAgent});
        statusLine.textContent = data.gatePassed ? 'Diagnostic complete — correctness checks passed.' : 'Diagnostic complete — correctness checks failed.';
        statusLine.dataset.state = data.gatePassed ? 'passed' : 'failed';
        document.body.dataset.done = 'true';
      }
      if (data.kind === 'result' || data.kind === 'error') {
        // Report persistence must never hide a completed result or leave the page busy.
        const result = window.proofResult;
        try {
          const saved = await fetch('/report', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result), signal: AbortSignal.timeout(8000)});
          if (!saved.ok) throw new Error('HTTP ' + saved.status);
          if (window.proofResult === result) element('save-status').textContent = 'Saved to artifacts/runtime-proof/. Expand the raw evidence above for details.';
        } catch (error) {
          if (window.proofResult === result) element('save-status').textContent = 'Result is visible above, but saving it failed: ' + error.message;
        }
      }
    };
    worker.postMessage({backend, mode, tokenizerMode});
  } catch (error) { failure(error.message, backend); }
}

for (const backend of ['gpu', 'cpu']) element(backend).onclick = () => run(backend);
element('check').onclick = checkSetup;
element('stop').onclick = () => {
  finish();
  statusLine.textContent = 'Stopped. The worker has been terminated. Choose a diagnostic to try again.';
  document.body.dataset.done = 'cancelled';
};
checkSetup();
