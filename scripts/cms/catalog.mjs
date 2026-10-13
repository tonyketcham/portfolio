import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const digest = (text) => createHash('sha256').update(text).digest('hex');
const copyKeys = /^(name|title|text|summary|examine|role|pronouns|arrival|blurb|note|line|label|alt|description|verb|from)$/;
const technicalKeys = /^(id|slug|kind|type|speaker|next|zone|room|style|skill|src|href|poster|playbackId|pattern|color|className|key|code|fontFamily|fontWeight|fontSize|display|position|animation|transform|background|border|overflow|alignItems|justifyContent|pointerEvents)$/;
const copyCalls = /^(say|examine|sayOverhead|npcSay|loading|setLoading|toast|title|label|fillText|strokeText)$/;
const copyAttributes = /^(title|alt|aria-label|aria-description|placeholder|text|label)$/;

function property(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isPropertyAssignment(parent)) return parent.name.getText().replace(/^['"]|['"]$/g, '');
    if (ts.isStatement(parent)) break;
  }
  return '';
}

function isRuntime(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isTypeNode(parent)) return false;
    if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return false;
    if (ts.isImportTypeNode(parent)) return false;
  }
  return !ts.isExpressionStatement(node.parent); // 'use client' etc.
}

function isCopy(node, value, kind) {
  if (kind === 'jsx') return true;
  if (ts.isJsxAttribute(node.parent)) return copyAttributes.test(node.parent.name.getText());
  if (ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)) return copyAttributes.test(node.parent.parent.name.getText());
  if (ts.isJsxExpression(node.parent) && (ts.isJsxElement(node.parent.parent) || ts.isJsxFragment(node.parent.parent))) return true;
  if (ts.isBinaryExpression(node.parent) && ts.isPropertyAccessExpression(node.parent.left) && /^(font|textBaseline|textAlign|fillStyle|strokeStyle|globalCompositeOperation|lineJoin|lineCap)$/.test(node.parent.left.name.text)) return false;
  const key = property(node);
  if (technicalKeys.test(key)) return false;
  if (copyKeys.test(key)) return true;
  const argument = ts.isTemplateExpression(node.parent) ? node.parent : node;
  const parent = argument.parent;
  if (ts.isCallExpression(parent)) {
    if (parent.expression.kind === ts.SyntaxKind.ImportKeyword || parent.expression.getText() === 'require') return false;
    const call = parent.expression.getText().split('.').pop();
    if (copyCalls.test(call)) return parent.arguments[0] === argument || (call === 'say' && parent.arguments[2] === argument);
    if (/^(open|fetch|querySelector|closest|matches|addEventListener|removeEventListener|setItem|getItem|removeItem|join|split|replace|startsWith|endsWith|includes|log|warn|error)$/.test(call)) return false;
  }
  // Catch prose arrays, ternaries, buttons and single-word display labels.
  return /[\p{L}]/u.test(value) && !/^(?:[#./@]|https?:|mailto:|var\(|rgb|::)/.test(value)
    && !/^[a-z0-9_-]+$/.test(value) && !/^[A-Z0-9_]+$/.test(value)
    && !/[{};]|=>/.test(value);
}

function jsxValue(raw) {
  const lines = raw.replace(/\t/g, ' ').split(/\r?\n/);
  let last = 0;
  lines.forEach((line, i) => { if (/\S/.test(line)) last = i; });
  return lines.map((line, i) => {
    if (i !== 0) line = line.trimStart();
    if (i !== lines.length - 1) line = line.trimEnd();
    return line ? line + (i !== last ? ' ' : '') : '';
  }).join('').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity];
  });
}

export function extractFields(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const fields = [];
  const occurrences = new Map();
  function identity(node, kind) {
    const parts = [kind];
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isPropertyAssignment(parent)) {
        parts.push(parent.name.getText());
        const object = parent.parent;
        if (ts.isObjectLiteralExpression(object)) {
          const owner = object.properties.find((p) => ts.isPropertyAssignment(p) && /^(id|slug)$/.test(p.name.getText()) && ts.isStringLiteral(p.initializer));
          if (owner) parts.push(`owner:${owner.initializer.text}`);
        }
      } else if (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)) parts.push(parent.name?.getText() ?? 'anonymous');
      else if (ts.isJsxAttribute(parent)) parts.push(`attribute:${parent.name.getText()}`);
      else if (ts.isJsxElement(parent)) parts.push(`element:${parent.openingElement.tagName.getText()}`);
    }
    const signature = parts.reverse().join('/');
    const count = occurrences.get(signature) ?? 0;
    occurrences.set(signature, count + 1);
    return digest(`${file}:${signature}:${count}`).slice(0, 24);
  }
  function visit(node) {
    let kind;
    if (ts.isJsxText(node)) kind = 'jsx';
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) kind = 'string';
    else if (ts.isTemplateHead(node)) kind = 'head';
    else if (ts.isTemplateMiddle(node)) kind = 'middle';
    else if (ts.isTemplateTail(node)) kind = 'tail';
    if (kind && isRuntime(node)) {
      const start = node.getStart(ast), end = node.end;
      const raw = source.slice(start, end);
      const value = kind === 'jsx' ? jsxValue(raw) : node.text;
      if (value.trim() || (kind !== 'jsx' && isCopy(node, value, kind))) {
        const line = ast.getLineAndCharacterOfPosition(start).line + 1;
        let context = property(node);
        for (let parent = node.parent; parent && !context; parent = parent.parent) {
          if (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)) context = parent.name?.getText() ?? '';
          if (ts.isJsxElement(parent)) context = parent.openingElement.tagName.getText();
        }
        fields.push({ id: digest(`${file}:${start}:${raw}`).slice(0, 24), key: identity(node, kind), file, line, context, kind, value, start, end, raw, copy: isCopy(node, value, kind) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return fields;
}

export function encodeField(field, value) {
  if (field.kind === 'jsx') return `{${JSON.stringify(value)}}`;
  if (field.kind === 'string') {
    // JSX attributes need an expression container to safely encode quotes/braces.
    if (field.raw.startsWith('"') && field.attribute) return `{${JSON.stringify(value)}}`;
    const quote = field.raw[0];
    if (quote !== '`') return quote + value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote).replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + quote;
  }
  const text = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  if (field.kind === 'head') return '`' + text + '${';
  if (field.kind === 'middle') return '}' + text + '${';
  if (field.kind === 'tail') return '}' + text + '`';
  return '`' + text + '`';
}

export function applyEdits(file, source, changes) {
  const fields = new Map(extractFields(file, source).map((field) => [field.id, field]));
  const edits = changes.map(({ id, value }) => {
    const field = fields.get(id);
    if (!field || typeof value !== 'string' || value.length > 20000 || value.includes('\0')) throw new Error('Invalid or outdated copy field. Reload the editor.');
    // Locate JSX attributes using the original AST, rather than guessing by quote.
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function locate(node) {
      if (node.getStart(ast) === field.start && node.end === field.end && ts.isJsxAttribute(node.parent)) field.attribute = true;
      ts.forEachChild(node, locate);
    }
    locate(ast);
    return { ...field, replacement: encodeField(field, value) };
  }).sort((a, b) => b.start - a.start);
  if (new Set(changes.map((c) => c.id)).size !== changes.length) throw new Error('Duplicate field edits.');
  let result = source;
  for (const edit of edits) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  const parsed = ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error('The edit produced invalid source. No files were saved.');
  return result;
}

export async function catalog(root) {
  const files = [];
  const resolvedRoot = await realpath(root);
  async function walk(folder) {
    for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(file);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(file);
    }
  }
  await walk('content');
  await walk('app');
  const result = [];
  for (const file of files.sort()) {
    const resolved = await realpath(path.join(root, file));
    if (!resolved.startsWith(resolvedRoot + path.sep)) throw new Error('Source file is outside the project.');
    const source = await readFile(resolved, 'utf8');
    const fields = extractFields(file, source);
    if (fields.length) result.push({ file, hash: digest(source), fields });
  }
  return result;
}
