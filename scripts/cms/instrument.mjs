import ts from 'typescript';
import { extractFields } from './catalog.mjs';

export function instrument(file, source, development) {
  if (!/^(?:content\/.*\.ts|app\/(?:otherworld\/|page\.tsx|classic\/|components\/|editor\/))/.test(file.replace(/\\/g, '/'))) return source;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const fields = extractFields(file, source).filter((field) => field.copy);
  const byStart = new Map(fields.map((field) => [field.start, field]));
  const call = (field, value) => `__owCopy(${JSON.stringify(field.key)}, ${value}${development ? ', ' + JSON.stringify({ key: field.key, file: field.file, line: field.line, context: field.context, kind: field.kind, fallback: field.value }) : ''})`;
  function rewrite(node) {
    const start = node.getStart(ast), end = node.end;
    const field = byStart.get(start);
    if (development && ts.isJsxAttribute(node) && node.name.getText() === 'text' && node.parent.parent.tagName.getText() === 'Label' && node.initializer) {
      const initializer = node.initializer;
      const part = byStart.get(initializer.getStart(ast));
      const expression = ts.isJsxExpression(initializer) ? rewrite(initializer.expression) : part ? call(part, JSON.stringify(part.value)) : initializer.getText(ast);
      return `{...__owLabelProps(() => (${expression}))}`;
    }
    if (ts.isTemplateExpression(node)) {
      const segments = [node.head, ...node.templateSpans.map((span) => span.literal)];
      const editable = segments.some((segment) => byStart.has(segment.getStart(ast)));
      if (editable) {
        const pieces = [];
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i], part = byStart.get(segment.getStart(ast));
          pieces.push(part ? call(part, JSON.stringify(segment.text)) : JSON.stringify(segment.text));
          if (i < node.templateSpans.length) pieces.push(`String(${rewrite(node.templateSpans[i].expression)})`);
        }
        const expression = '(' + pieces.join(' + ') + ')';
        return development ? `__owTemplate(() => ${expression})` : expression;
      }
    }
    if (field && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      const result = call(field, JSON.stringify(field.value));
      return ts.isJsxAttribute(node.parent) ? `{${result}}` : result;
    }
    if (ts.isJsxText(node) && field) return development
      ? `{__owValue(${call(field, JSON.stringify(field.value))}, [${JSON.stringify(field.key)}])}`
      : `{${call(field, JSON.stringify(field.value))}}`;
    if (development && ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      return `{__owCaptured(() => (${rewrite(node.expression)}))}`;
    }
    if (development && ts.isImportSpecifier(node) && node.name.text === 'useFrame' && node.parent.parent.parent.moduleSpecifier.text === '@react-three/fiber') return 'useFrame';
    if (development && ts.isPropertyAccessExpression(node) && /^window\.(?:setTimeout|setInterval|clearTimeout|clearInterval)$/.test(node.getText(ast))) return '__ow' + node.name.text[0].toUpperCase() + node.name.text.slice(1);
    if (development && ts.isCallExpression(node) && node.expression.getText(ast) === 'performance.now') return '__owNow()';
    if (development && ts.isCallExpression(node) && node.expression.getText(ast) === 'document.createElement' && node.arguments[0]?.getText(ast).match(/^['"]video['"]$/)) return `__owVideo(${node.getText(ast)})`;
    if (development && ts.isIdentifier(node) && ['requestAnimationFrame', 'cancelAnimationFrame'].includes(node.text) && ts.isCallExpression(node.parent) && node.parent.expression === node) return node.text === 'requestAnimationFrame' ? '__owRaf' : '__owCancelRaf';
    if (development && ts.isNewExpression(node) && file.endsWith('/audio/sfx.ts') && node.expression.getText(ast) === 'Ctor') return '__owAudio(new Ctor())';
    const children = [];
    ts.forEachChild(node, (child) => { children.push(child); });
    let result = source.slice(start, end);
    for (const child of children.reverse()) {
      const replacement = rewrite(child);
      if (replacement !== source.slice(child.getStart(ast), child.end)) result = result.slice(0, child.getStart(ast) - start) + replacement + result.slice(child.end - start);
    }
    if (development && ts.isJsxAttribute(node) && node.name.getText() === 'paused' && node.parent.parent.tagName.getText() === 'Physics') result = result.replace(/^paused=\{/, 'paused={__owUsePause() || ');
    // Runtime object copy remains live without rebuilding the scene's ownership.
    if (ts.isPropertyAssignment(node) && fields.some((f) => f.start >= node.initializer.getStart(ast) && f.end <= node.initializer.end)) {
      const initializer = rewrite(node.initializer);
      if (ts.isStringLiteral(node.initializer) || ts.isTemplateExpression(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) result = `get ${node.name.getText()}() { return ${initializer}; }`;
    }
    return result;
  }
  let output = source;
  const children = [];
  ts.forEachChild(ast, (child) => { children.push(child); });
  for (const node of children.reverse()) output = output.slice(0, node.getStart(ast)) + rewrite(node) + output.slice(node.end);
  if (development) {
    // Swap just the frame hook; keep all other Fiber imports unchanged.
    output = output.replace(/\buseFrame\s*,?\s*(?=[^}]*}\s*from\s*['"]@react-three\/fiber['"])/g, '');
    const hooks = `import { copy as __owCopy, template as __owTemplate, captured as __owCaptured, value as __owValue, useFrame, now as __owNow, setTimeout as __owSetTimeout, setInterval as __owSetInterval, clearTimer as __owClearTimeout, clearTimer as __owClearInterval, raf as __owRaf, cancelRaf as __owCancelRaf, audio as __owAudio, video as __owVideo, useLabel as __owUseLabel, labelProps as __owLabelProps, paint as __owPaint, registerCanvas as __owCanvas, usePause as __owUsePause, bindRuntime as __owBindRuntime, bindPicker as __owBindPicker, mount } from '@/scripts/cms/game-runtime.mjs';\n`;
    const directive = /^(['"]use client['"];?\s*)/.exec(output);
    const at = directive?.[0].length ?? 0;
    output = output.slice(0, at) + hooks + output.slice(at);
    if (file.endsWith('/state/runtime.ts')) output += '\n__owBindRuntime(runtime);\n';
    if (file.endsWith('/scene/Interaction.tsx')) output += '\n__owBindPicker(pickInteractables);\n';
    if (file.endsWith('/Otherworld.tsx')) output += '\nif (typeof window !== "undefined") mount();\n';
    if (file.endsWith('/scene/Label.tsx')) {
      output = output.replace('text: string;', 'text: string; __copyKeys?: string[];');
      output = output.replace('  text,', '  text, __copyKeys,');
      output = output.replace('const optionsKey =', 'const __owLabel = __owUseLabel(text, __copyKeys);\n  text = __owLabel.text;\n  const optionsKey =');
      output = output.replace('<mesh position-x=', '<mesh userData={{ owCopy: __owLabel.keys, owText: text }} position-x=');
    }
    if (file.endsWith('/house/furniture/common.ts')) {
      output = output.replace('paint(g, w, h);', 'const __owCanvasCopy = __owPaint(() => paint(g, w, h));');
      output = output.replace('return tex;', '__owCanvas(tex, __owCanvasCopy, () => { g.clearRect(0, 0, w, h); paint(g, w, h); });\n  return tex;');
    }
  } else if (fields.length) {
    const directive = /^(['"]use client['"];?\s*)/.exec(output);
    const at = directive?.[0].length ?? 0;
    output = output.slice(0, at) + "import { copy as __owCopy } from '@/content/copy-runtime.mjs';\n" + output.slice(at);
  }
  return output;
}
