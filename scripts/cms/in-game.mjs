import { editorState as state, changed, current, matches, pause, previewText, renderFrozen, setDraft, subscribe, worldKeys } from './game-runtime.mjs';

export function mountEditor() {
  if (document.getElementById('ow-copy-editor')) return;
  const host = document.createElement('div'); host.id = 'ow-copy-editor';
  host.innerHTML = `<button class="copy-launch" type="button" title="Pause and edit copy (Ctrl/⌘ Shift E)">Pause & edit copy</button>
    <div class="copy-highlight" hidden></div>
    <aside class="copy-editor" aria-label="In-game copy editor" hidden>
      <header><div><span class="copy-eyebrow">DEV · WORLD PAUSED</span><h2>Edit this moment</h2></div><button class="copy-resume" type="button" aria-label="Resume game">▶ Resume</button></header>
      <p class="copy-guidance">Click words in the game, or a world object. Edit them here and see the result in place.</p>
      <button class="copy-dock" type="button" title="Move the editor to uncover copy underneath">Move panel to the other side ↔</button>
      <button class="copy-refresh" type="button" title="Refresh source and Git status while keeping this moment paused">Refresh copy ↻</button>
      <div class="copy-selection" aria-live="polite">Choose some copy</div>
      <div class="copy-fields"></div>
      <details class="copy-find"><summary>Find other game copy</summary><input type="search" placeholder="Find words…" aria-label="Find game copy"><div class="copy-results"></div></details>
      <footer><p class="copy-draft-count">No unsaved changes</p><input class="copy-message" placeholder="Commit message (optional)" aria-label="Copy commit message" maxlength="300"><div class="copy-buttons"><button class="copy-save" type="button" disabled>Save & commit</button><button class="copy-push" type="button" disabled>Push to main ↑</button></div><button class="copy-discard" type="button" hidden>Discard unsaved edits</button><p class="copy-notice" role="status" aria-live="polite"></p><details class="copy-commits"><summary>Pending commits</summary><ul></ul></details></footer>
    </aside>`;
  document.body.append(host);
  const $ = (selector) => host.querySelector(selector);
  let token = null, records = [], status = {}, selection = [], selectedElement = null, selectedAttrs = [], busy = false, connected = false;
  const launcher = $('.copy-launch'), panel = $('.copy-editor'), highlight = $('.copy-highlight');
  const notify = (message, error = false) => { $('.copy-notice').textContent = message; $('.copy-notice').dataset.error = String(error); };
  async function request(route, body) {
    if (!token) {
      const html = await fetch('/cms/').then((response) => { if (!response.ok) throw new Error('Start the local CMS with pnpm cms, then try again.'); return response.text(); });
      token = /name="cms-token" content="([^"]+)"/.exec(html)?.[1];
      if (!token) throw new Error('The copy editor could not connect to the local CMS. Start pnpm dev or pnpm cms.');
    }
    const response = await fetch(`/cms/api/${route}`, { method: body ? 'POST' : 'GET', headers: { 'x-cms-token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 403) token = null; throw new Error(data.error || 'Could not complete this action.'); }
    return data;
  }
  async function connect() {
    try {
      const data = await request('catalog'); records = data.records; status = data.status;
      state.saved = data.savedCopy ?? {}; state.copyHash = data.copyHash; connected = true;
      // Registry entries are known even when their particular branch has not rendered yet.
      for (const record of records) for (const field of record.fields.filter((field) => field.copy)) state.fields.set(field.key, { key: field.key, fallback: field.value, file: field.file, line: field.line, context: field.context, kind: field.kind });
      changed(); update(); return true;
    } catch (error) { notify(error.message, true); return false; }
  }
  function update() {
    for (const attr of selectedAttrs) {
      const field = attr.keys.length === 1 ? state.fields.get(attr.keys[0]) : null;
      selectedElement?.setAttribute(attr.name, field && !state.textOrigins.has(attr.text) ? current(field.key) : previewText(attr.text));
    }
    panel.hidden = !state.paused; launcher.textContent = state.paused ? 'Copy edit · paused' : `Pause & edit copy${state.drafts.size ? ` (${state.drafts.size} ${state.drafts.size === 1 ? 'draft' : 'drafts'})` : ''}`;
    launcher.setAttribute('aria-pressed', String(state.paused));
    $('.copy-draft-count').textContent = state.drafts.size ? `${state.drafts.size} unsaved ${state.drafts.size === 1 ? 'edit' : 'edits'} · previewing in game` : 'No unsaved changes';
    $('.copy-save').disabled = busy || !state.drafts.size || !connected || !status.ready;
    $('.copy-save').textContent = busy ? 'Working…' : 'Save & commit';
    $('.copy-push').disabled = busy || state.drafts.size > 0 || !status.ready || status.ahead === 0 || status.behind > 0;
    $('.copy-discard').hidden = !state.drafts.size;
    $('.copy-resume').disabled = busy;
    $('.copy-refresh').disabled = busy;
    for (const input of host.querySelectorAll('textarea, .copy-message')) input.disabled = busy;
    $('.copy-commits').hidden = !status.commits?.length;
    $('.copy-commits summary').textContent = `${status.commits?.length ?? 0} pending ${status.commits?.length === 1 ? 'commit' : 'commits'}`;
    $('.copy-commits ul').replaceChildren(...(status.commits || []).map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    if (!state.paused) highlight.hidden = true;
    else if (selectedElement?.isConnected) outline(selectedElement);
  }
  function outline(element) {
    const range = document.createRange(); range.selectNodeContents(element);
    let rect = range.getBoundingClientRect();
    if (!rect.width) rect = element.getBoundingClientRect();
    highlight.hidden = false;
    Object.assign(highlight.style, { left: `${rect.left - 4}px`, top: `${rect.top - 3}px`, width: `${rect.width + 8}px`, height: `${rect.height + 6}px` });
  }
  function select(keys, name, element, attributes = []) {
    selection = [...new Set(keys)].filter((key) => state.fields.has(key));
    selectedElement = element;
    selectedAttrs = attributes;
    $('.copy-selection').textContent = name || 'Selected copy';
    $('.copy-fields').replaceChildren();
    highlight.hidden = !element;
    if (element) outline(element);
    if (!selection.length) { notify('No authored copy found here. Try clicking a label, dialogue, tooltip, or another object.'); return; }
    notify('');
    for (const key of selection) {
      const field = state.fields.get(key);
      const block = document.createElement('div'); block.className = 'copy-field';
      const label = document.createElement('label'); label.textContent = field.context || 'Copy'; label.htmlFor = `copy-game-${key}`;
      const input = document.createElement('textarea'); input.id = label.htmlFor; input.value = current(key); input.maxLength = 20000; input.rows = Math.max(2, Math.min(7, Math.ceil(input.value.length / 42))); input.setAttribute('aria-label', `Edit ${field.context || 'copy'}`);
      const source = document.createElement('small'); source.textContent = `${field.file}:${field.line}${['head', 'tail', 'middle'].includes(field.kind) ? ' · text segment' : ''}`;
      input.addEventListener('input', () => { setDraft(key, input.value); renderFrozen(); requestAnimationFrame(() => { if (selectedElement?.isConnected) outline(selectedElement); }); });
      block.append(label, input, source); $('.copy-fields').append(block);
    }
    update();
    $('.copy-fields textarea')?.focus({ preventScroll: true });
  }
  function pick(event) {
    const element = event.target instanceof Element ? event.target : null;
    if (!element || host.contains(element)) return;
    const traced = element.closest('[data-ow-copy]');
    if (traced) return select(traced.dataset.owCopy.split(' '), traced.textContent.trim().slice(0, 90), traced);
    const attrs = ['placeholder', 'title', 'aria-label', 'alt'].map((name) => ({ name, text: element.getAttribute(name) || '', keys: matches(element.getAttribute(name) || '') })).filter((attr) => attr.keys.length);
    if (attrs.length) return select(attrs.flatMap((attr) => attr.keys), element.getAttribute('title') || element.getAttribute('placeholder') || 'Selected label', element, attrs);
    if (element instanceof HTMLCanvasElement) {
      const result = worldKeys(event.clientX, event.clientY);
      select(result.keys, result.name || 'World object', null);
      return;
    }
    const directText = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('');
    select(matches(directText), directText.trim().slice(0, 90), element);
  }
  const toggle = () => { if (!busy) { pause(!state.paused); if (state.paused) connect(); } };
  launcher.addEventListener('click', toggle);
  $('.copy-resume').addEventListener('click', toggle);
  $('.copy-dock').addEventListener('click', () => { host.dataset.side = host.dataset.side === 'left' ? 'right' : 'left'; });
  $('.copy-refresh').addEventListener('click', async () => { if (!busy && await connect()) notify('Copy and Git status refreshed. Your drafts and paused world are preserved.'); });
  subscribe(update);
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyE') { event.preventDefault(); event.stopImmediatePropagation(); toggle(); return; }
    if (!state.paused) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); event.stopImmediatePropagation(); if (!$('.copy-save').disabled) $('.copy-save').click(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) toggle(); return; }
    if (!host.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'contextmenu', 'wheel', 'keyup', 'touchstart', 'touchmove']) window.addEventListener(type, (event) => {
    if (!state.paused || host.contains(event.target)) return;
    if (type === 'pointerdown' && event.button === 0) pick(event);
    event.preventDefault(); event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  $('.copy-find input').addEventListener('input', () => {
    const query = $('.copy-find input').value.toLowerCase().trim();
    const results = query ? [...state.fields.values()].filter((field) => current(field.key).toLowerCase().includes(query)).slice(0, 20) : [];
    $('.copy-results').replaceChildren(...results.map((field) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = current(field.key).slice(0, 90); button.addEventListener('click', () => select([field.key], current(field.key).slice(0, 90), null)); return button;
    }));
  });
  $('.copy-discard').addEventListener('click', () => { state.drafts.clear(); changed(); if (selection.length) select(selection, 'Selected copy', selectedElement, selectedAttrs); renderFrozen(); notify('Unsaved edits discarded.'); });
  async function action(run) { if (busy) return; busy = true; update(); try { await run(); } catch (error) { notify(error.message, true); } finally { busy = false; update(); } }
  $('.copy-save').addEventListener('click', () => action(async () => {
    const changes = [...state.drafts].map(([key, value]) => ({ key, value }));
    const result = await request('save-copy', { changes, hashes: Object.fromEntries(records.map((record) => [record.file, record.hash])), copyHash: state.copyHash, message: $('.copy-message').value });
    state.saved = result.savedCopy; state.drafts.clear(); status = result.status; state.copyHash = result.copyHash; $('.copy-message').value = ''; changed();
    notify(`Saved · commit ${result.commit}. Your world is still paused.`);
  }));
  $('.copy-push').addEventListener('click', () => action(async () => { const result = await request('push', { expectedHead: status.head }); status = result.status; notify(result.message); }));
  window.addEventListener('beforeunload', (event) => { if (state.drafts.size) { event.preventDefault(); event.returnValue = ''; } });
  update();
  // Development reads saved copy through the companion instead of importing JSON.
  // A save can then update the live scene without triggering a world-remounting HMR.
  connect();
}
