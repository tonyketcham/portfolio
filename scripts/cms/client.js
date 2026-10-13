/* This file is served only by the local development companion. */
const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name=cms-token]').content;
let records = [], fields = new Map(), drafts = new Map(), gitStatus = {}, selected = 'all', busy = false, visibleLimit = 80;
let copyHash;
const groupNames = {
  content: 'Profile & projects', hud: 'Interface & dialogue', house: 'House & furniture', pet: 'Cat',
  state: 'Actions, skills & items', scene: 'World interactions', world: 'Island & places',
  audio: 'Music', classic: 'Classic site', components: 'Classic interface', editor: 'Classic projects',
  debug: 'Dev tuning labels', other: 'More experience text',
};
function group(file) {
  if (file.startsWith('content/')) return 'content';
  if (file.startsWith('app/otherworld/')) return groupNames[file.split('/')[2]] ? file.split('/')[2] : 'other';
  return groupNames[file.split('/')[1]] ? file.split('/')[1] : 'other';
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notify(message, error = false) {
  $('notification').hidden = false;
  $('notification').dataset.error = String(error);
  $('notification').textContent = message;
}
async function request(route, data) {
  const result = await fetch(`/cms/api/${route}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'X-CMS-Token': token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await result.json();
  if (!result.ok) throw new Error(body.error || 'The CMS could not complete this action.');
  return body;
}
function updateRevision() {
  $('change-count').textContent = drafts.size ? `${drafts.size} ${drafts.size === 1 ? 'field' : 'fields'} changed` : 'No changes yet';
  $('save').disabled = busy || !drafts.size || !gitStatus.ready;
  $('save').textContent = busy ? 'Working…' : 'Save & commit';
  $('push').disabled = busy || drafts.size > 0 || !gitStatus.ready || gitStatus.behind > 0 || gitStatus.ahead === 0;
  $('push').title = drafts.size ? 'Save your changes before pushing.' : gitStatus.behind ? 'Remote main has newer commits. Reconcile them in Git first.' : '';
  $('reload').disabled = busy;
  $('refresh-status').disabled = busy;
  $('message').disabled = busy;
  for (const node of document.querySelectorAll('.field textarea, .restore')) node.disabled = busy;
  const files = new Map();
  for (const id of drafts.keys()) { const file = fields.get(id).file; files.set(file, (files.get(file) || 0) + 1); }
  $('changed-list').replaceChildren(...[...files].map(([file, count]) => element('p', `${file} · ${count}`)));
}
function updateGit(status) {
  gitStatus = status;
  $('git-status').textContent = status.error || `${status.branch} · ${status.ahead ?? '?'} pending ${status.ahead === 1 ? 'commit' : 'commits'}${status.behind ? ` · ${status.behind} behind remote` : ''}`;
  $('remote').textContent = status.remote || '';
  $('pending').hidden = !status.commits?.length;
  const count = status.commits?.length || 0;
  $('pending-summary').textContent = `Review ${count} pending ${count === 1 ? 'commit' : 'commits'}`;
  $('commits').replaceChildren(...(status.commits || []).map((commit) => element('li', commit)));
  updateRevision();
}
function visibleFields(ignoreGroup = false) {
  const query = $('search').value.toLowerCase().trim();
  return [...fields.values()].filter((field) =>
    ($('all-strings').checked || field.copy)
    && (ignoreGroup || selected === 'all' || group(field.file) === selected)
    && (!$('changed').checked || drafts.has(field.id))
    && (!query || `${drafts.get(field.id) ?? field.value} ${field.context} ${field.file}`.toLowerCase().includes(query))
  );
}
function renderSections() {
  const counts = new Map();
  const all = visibleFields(true);
  for (const field of all) { const key = group(field.file); counts.set(key, (counts.get(key) || 0) + 1); }
  $('sections').replaceChildren();
  for (const [key, label, count] of [['all', 'All copy', all.length], ...Object.entries(groupNames).filter(([key]) => counts.has(key)).map(([key, label]) => [key, label, counts.get(key)])]) {
    const button = element('button'); button.type = 'button'; button.setAttribute('aria-current', String(selected === key));
    button.append(element('span', label), element('small', String(count)));
    button.addEventListener('click', () => { selected = key; visibleLimit = 80; render(); });
    $('sections').append(button);
  }
}
function render() {
  renderSections();
  const visible = visibleFields();
  $('section-title').textContent = selected === 'all' ? 'All copy' : groupNames[selected];
  $('field-count').textContent = `${visible.length} fields${visible.length > visibleLimit ? ` · showing ${visibleLimit}` : ''}`;
  $('fields').replaceChildren();
  if (!visible.length) $('fields').append(element('p', 'No copy matches these filters.', 'empty'));
  let currentFile = '';
  for (const field of visible.slice(0, visibleLimit)) {
    if (field.file !== currentFile) { currentFile = field.file; $('fields').append(element('h3', field.file, 'file-heading')); }
    const card = element('div', undefined, `field${drafts.has(field.id) ? ' dirty' : ''}`);
    const top = element('div', undefined, 'field-top');
    const label = element('label', field.context ? field.context.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Copy');
    label.htmlFor = `field-${field.id}`;
    top.append(label);
    if (['head', 'middle', 'tail'].includes(field.kind)) top.append(element('span', 'Dynamic text · expressions kept', 'hint'));
    else if (!field.copy) top.append(element('span', 'Technical string · read only', 'hint'));
    const restore = element('button', 'Reset', 'restore'); restore.type = 'button'; restore.hidden = !drafts.has(field.id); restore.setAttribute('aria-label', `Reset ${field.context || 'copy'} on line ${field.line}`);
    top.append(restore);
    const input = element('textarea'); input.id = label.htmlFor; input.value = drafts.get(field.id) ?? field.value;
    input.readOnly = !field.copy;
    input.rows = Math.min(7, Math.max(2, Math.ceil(input.value.length / 85), input.value.split('\n').length)); input.maxLength = 20000;
    const details = element('details'); details.append(element('summary', `Source · line ${field.line}`), element('p', field.value));
    input.addEventListener('input', () => {
      if (input.value === field.value) drafts.delete(field.id); else drafts.set(field.id, input.value);
      card.classList.toggle('dirty', drafts.has(field.id)); restore.hidden = !drafts.has(field.id); updateRevision();
    });
    restore.addEventListener('click', () => { drafts.delete(field.id); input.value = field.value; card.classList.remove('dirty'); restore.hidden = true; updateRevision(); });
    card.append(top, input, details); $('fields').append(card);
  }
  if (visible.length > visibleLimit) {
    const more = element('button', `Show next ${Math.min(80, visible.length - visibleLimit)} fields`);
    more.addEventListener('click', () => { visibleLimit += 80; render(); });
    $('fields').append(more);
  }
  updateRevision();
}
async function load() {
  const result = await request('catalog');
  records = result.records;
  copyHash = result.copyHash;
  fields = new Map(records.flatMap((record) => record.fields.map((field) => [field.id, { ...field, value: result.savedCopy?.[field.key]?.value ?? field.value }])));
  $('catalog-count').textContent = `${[...fields.values()].filter((field) => field.copy).length} copy fields · ${records.length} source files`;
  updateGit(result.status); render();
}
async function action(run) {
  if (busy) return;
  busy = true; updateRevision();
  try { await run(); } catch (error) { notify(error.message, true); }
  finally { busy = false; updateRevision(); }
}
$('save').addEventListener('click', () => action(async () => {
  const result = await request('save-copy', { changes: [...drafts].map(([id, value]) => ({ key: fields.get(id).key, value })), hashes: Object.fromEntries(records.map((record) => [record.file, record.hash])), copyHash, message: $('message').value });
  drafts.clear(); $('message').value = '';
  notify(`Saved copy. Commit ${result.commit}.`); updateGit(result.status);
  await load();
}));
$('push').addEventListener('click', () => action(async () => {
  const result = await request('push', { expectedHead: gitStatus.head });
  notify(result.message); updateGit(result.status);
}));
$('refresh-status').addEventListener('click', () => action(async () => updateGit(await request('status'))));
$('reload').addEventListener('click', () => {
  if (drafts.size && !window.confirm('Discard your unsaved copy edits and reload the source?')) return;
  action(async () => { await load(); drafts.clear(); render(); notify('Source reloaded.'); });
});
for (const id of ['search', 'changed', 'all-strings']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { visibleLimit = 80; render(); });
window.addEventListener('beforeunload', (event) => { if (drafts.size) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('save').disabled) $('save').click(); } });
load().catch((error) => { notify(error.message, true); $('fields').replaceChildren(element('p', 'Could not load copy. Use Reload source to retry.', 'empty')); });
