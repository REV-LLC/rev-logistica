import type { PdfDocument, TextRun } from 'ts-pdf-edit';

// Private engine modules are tied to the exact pinned ts-pdf-edit version.
const root = import.meta.resolve('ts-pdf-edit');
const modules = Promise.all([
  import(new URL('./content/streams.js', root).href),
  import(new URL('./content/scanner.js', root).href),
  import(new URL('./content/resources.js', root).href),
  import(new URL('./content/interpreter.js', root).href),
  import(new URL('./cos/adapters.js', root).href),
  import(new URL('./cos/streams.js', root).href),
]);

type Operand = { t: string; bytes?: Uint8Array; v?: number; items?: Operand[]; start?: number; end?: number };
type Operation = { index: number; op: string; start: number; end: number; operands: Operand[] };
type Glyph = { text: string; bytes: Uint8Array; width: number; space: boolean; kern: number; synthetic?: boolean };
type State = { charSpacing: number; wordSpacing: number };
type Run = { opIndex: number; stringStart: number; stringEnd: number; fontName: string; fontSize: number; hScale: number; renderMode: number; originDevice: { x: number; y: number }; trm: { a: number; b: number; c: number; d: number }; advanceText: number };
export class TextFidelityError extends Error { constructor(message: string) { super(message); this.name = 'TextFidelityError'; } }
function fail(message: string): never { throw new TextFidelityError(message); }
const hex = (bytes: Uint8Array) => `<${Buffer.from(bytes).toString('hex')}>`;
const number = (value: number) => { if (!Number.isFinite(value)) fail('El documento contiene métricas de texto inválidas.'); return Number(value.toFixed(8)).toString(); };

function utf16(hexValue: string) {
  if (hexValue.length % 4) return '';
  const units = hexValue.match(/.{4}/g) ?? [];
  return units.map((unit) => String.fromCharCode(parseInt(unit, 16))).join('');
}

// ToUnicode maps preserve the PDF's actual character codes, including embedded
// font subsets. We only reuse codes present in this map; never embed a fallback.
function cmapEntries(source: string) {
  const map = new Map<string, string>();
  source = source.replace(/%[^\r\n]*/g, '');
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
      const text = utf16(pair[2]);
      if (text && [2, 4].includes(pair[1].length)) map.set(pair[1].toLowerCase(), text);
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]*)\])/gi)) {
      const start = parseInt(range[1], 16), end = parseInt(range[2], 16);
      if (![2, 4].includes(range[1].length) || end < start || end - start > 65535) continue;
      const array = range[5] ? [...range[5].matchAll(/<([\da-f]+)>/gi)].map((item) => item[1]) : null;
      for (let code = start; code <= end; code++) {
        let target = array?.[code - start];
        if (!array && range[4]?.length <= 8) target = (BigInt(`0x${range[4]}`) + BigInt(code - start)).toString(16).padStart(range[4].length, '0');
        const text = target ? utf16(target) : '';
        if (text) map.set(code.toString(16).padStart(range[1].length, '0'), text);
      }
    }
  }
  return map;
}

type RenderState = State & { fontName: string; fontSize: number; hScale: number; leading: number; rise: number; renderMode: number };
type Source = {
  bytes: Uint8Array;
  chain: import('pdf-lib').PDFDict[];
  ctm: import('ts-pdf-edit').Matrix;
  initial: RenderState;
  ops: Operation[];
  offset: number;
  form?: import('pdf-lib').PDFRawStream;
  parent?: { source: Source; op: Operation };
};

async function sourcesFor(doc: PdfDocument, pageIndex: number) {
  const [{ logicalContentForPage }, { scan }, { ResourceResolver }, , { PDFName, PDFDict, PDFNumber, PDFArray }, { decodeStream }] = await modules;
  const { Matrix } = await import('ts-pdf-edit');
  const page = doc.getPage(pageIndex);
  const resources = page._inner.node.Resources();
  const sources: Source[] = [];
  let offset = 0;
  function visit(source: Source, ancestors: Set<unknown>) {
    sources.push(source); source.offset = offset; offset += source.ops.length + 1;
    if (source.parent && ancestors.size > 16) return;
    const resolver = source.chain.reduceRight((parent, resource) => new ResourceResolver(doc._inner.context, resource, parent), undefined);
    let ctm = source.ctm, state = { ...source.initial };
    const stack: { ctm: import('ts-pdf-edit').Matrix; state: RenderState }[] = [];
    for (const op of source.ops) {
      const nums = op.operands.filter((item) => item.t === 'num').map((item) => item.v!);
      if (op.op === 'q') stack.push({ ctm, state: { ...state } });
      if (op.op === 'Q') { const saved = stack.pop(); if (saved) { ctm = saved.ctm; state = saved.state; } }
      if (op.op === 'cm' && nums.length === 6) ctm = Matrix.of(nums as [number, number, number, number, number, number]).multiply(ctm);
      if (op.op === 'Tf') { state.fontName = String(op.operands.find((item) => item.t === 'name')?.v ?? ''); state.fontSize = nums[0] ?? state.fontSize; }
      if (op.op === 'Tc') state.charSpacing = nums[0];
      if (op.op === 'Tw') state.wordSpacing = nums[0];
      if (op.op === 'Tz') state.hScale = nums[0] / 100;
      if (op.op === 'TL') state.leading = nums[0];
      if (op.op === 'Ts') state.rise = nums[0];
      if (op.op === 'Tr') state.renderMode = nums[0];
      if (op.op === '"') { state.wordSpacing = nums[0]; state.charSpacing = nums[1]; }
      if (op.op !== 'Do') continue;
      const name = op.operands.find((item) => item.t === 'name')?.v;
      const found = resolver?.xobject(name);
      if (!found || ancestors.has(found.stream) || found.stream.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Form') continue;
      let childCtm = ctm;
      const matrix = found.stream.dict.lookup(PDFName.of('Matrix'));
      if (matrix instanceof PDFArray && matrix.size() === 6) {
        const values = matrix.asArray().map((value) => value instanceof PDFNumber ? value.asNumber() : NaN);
        if (values.some((value) => !Number.isFinite(value))) continue;
        childCtm = Matrix.of(values as [number, number, number, number, number, number]).multiply(ctm);
      }
      const ownResources = found.stream.dict.lookup(PDFName.of('Resources'));
      const chain = ownResources instanceof PDFDict ? [ownResources, ...source.chain] : source.chain;
      const bytes = decodeStream(found.stream);
      if (sources.length >= 256 || offset > 1_000_000) continue;
      visit({ bytes, chain, ctm: childCtm, initial: { ...state }, ops: scan(bytes), offset: 0, form: found.stream, parent: { source, op } }, new Set([...ancestors, found.stream]));
    }
  }
  const bytes = logicalContentForPage(doc._inner.context, page._inner.node).bytes;
  visit({ bytes, chain: resources ? [resources] : [], ctm: Matrix.identity(), initial: { fontName: '', fontSize: 0, hScale: 1, leading: 0, rise: 0, renderMode: 0, charSpacing: 0, wordSpacing: 0 }, ops: scan(bytes), offset: 0 }, new Set());
  return sources;
}

async function writeSource(doc: PdfDocument, pageIndex: number, source: Source, bytes: Uint8Array) {
  const [, , , , { PDFName, PDFDict }] = await modules;
  const ctx = doc._inner.context;
  let resources = source.chain[0];
  let resourcesChanged = false;
  while (source.form && source.parent) {
    const copy = ctx.flateStream(bytes);
    for (const [key, value] of source.form.dict.entries()) {
      if (!['/Length', '/Filter', '/DecodeParms', '/DL'].includes(key.toString())) copy.dict.set(key, value);
    }
    if (resourcesChanged && resources) copy.dict.set(PDFName.of('Resources'), resources);
    const childRef = ctx.register(copy);
    const parent = source.parent;
    const newName = `RevText${childRef.objectNumber}`;
    const parentResources = parent.source.chain[0]?.clone(ctx) ?? ctx.obj({});
    const existing = parentResources.lookup(PDFName.of('XObject'));
    const xobjects = existing instanceof PDFDict ? (existing as import('pdf-lib').PDFDict).clone(ctx) : ctx.obj({});
    xobjects.set(PDFName.of(newName), childRef);
    parentResources.set(PDFName.of('XObject'), xobjects);
    bytes = Buffer.concat([parent.source.bytes.subarray(0, parent.op.start), Buffer.from(`/${newName} Do`, 'latin1'), parent.source.bytes.subarray(parent.op.end)]);
    source = parent.source;
    resources = parentResources;
    resourcesChanged = true;
  }
  const page = doc.getPage(pageIndex);
  page._inner.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(bytes)));
  if (resourcesChanged) page._inner.node.set(PDFName.of('Resources'), resources);
  doc.onContentChanged();
}

async function contextFor(doc: PdfDocument, pageIndex: number, source: Source, extractedText?: import('ts-pdf-edit').PageText) {
  const [{ logicalContentForPage }, { scan }, { ResourceResolver }, { ContentInterpreter }, { PDFName, PDFDict, PDFStream }, { decodeStream }] = await modules;
  const page = doc.getPage(pageIndex);
  const logical = { bytes: source.bytes };
  const ops = source.ops;
  const resolver = source.chain.reduceRight((parent, resource) => new ResourceResolver(doc._inner.context, resource, parent), undefined) ?? new ResourceResolver(doc._inner.context, undefined);
  const runs = new Map<number, Run[]>();
  // Interpret this invocation in its own resource and transformation scope.
  // Recursion is explicit so identical Form operator indices cannot collide.
  new ContentInterpreter(doc._inner.context).exec(ops, {
    font: (name: string) => resolver.font(name), xobject: () => undefined,
  }, { onGlyphRun: (run: Run) => runs.set(run.opIndex, [...(runs.get(run.opIndex) ?? []), run]) }, source.ctm, { ...source.initial, font: resolver.font(source.initial.fontName) }, 0);
  const extracted = extractedText ?? await page.text();
  const fontCache = new Map<string, ReturnType<typeof fontInfo>>();
  function fontInfo(name: string) {
    let dict: import('pdf-lib').PDFDict | undefined;
    for (const resource of source.chain) {
      const fonts = resource.lookup(PDFName.of('Font'));
      if (!(fonts instanceof PDFDict)) continue;
      const candidate = (fonts as import('pdf-lib').PDFDict).lookup(PDFName.of(name));
      if (candidate instanceof PDFDict) { dict = candidate as import('pdf-lib').PDFDict; break; }
    }
    const model = resolver.font(name);
    const toUnicode = dict?.lookup(PDFName.of('ToUnicode'));
    const map = toUnicode instanceof PDFStream ? cmapEntries(Buffer.from(decodeStream(toUnicode)).toString('latin1')) : new Map<string, string>();
    if (!map.size && model) {
      // Standard fonts: derive the inverse from the exact engine encoding, using
      // characters that pdf.js independently extracted from this page.
      for (const ch of new Set(Array.from(extracted.plainText))) {
        const encoded = model.encode(ch);
        if (encoded && !encoded.missing.length) map.set(Buffer.from(encoded.bytes).toString('hex'), ch);
      }
    }
    const baseFont = dict?.lookup(PDFName.of('BaseFont'));
    const encoding = dict?.lookup(PDFName.of('Encoding'));
    const encodingName = encoding instanceof PDFName ? (encoding as unknown as { decodeText(): string }).decodeText() : '';
    const nameValue = baseFont instanceof PDFName ? (baseFont as unknown as { decodeText(): string }).decodeText() : name;
    const descriptor = dict?.lookup(PDFName.of('FontDescriptor'));
    const embedded = descriptor instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((key) => (descriptor as unknown as { has(key: unknown): boolean }).has(PDFName.of(key)));
    const restricted = embedded || /^[A-Z]{6}\+/.test(nameValue) || toUnicode instanceof PDFStream;
    if (restricted && !(toUnicode instanceof PDFStream) && model) {
      const usedCodes = new Set<string>();
      const strings = ops.flatMap((op) => op.operands.flatMap((operand) => operand.t === 'arr' ? operand.items ?? [] : [operand])).filter((operand) => operand.t === 'str');
      for (const group of runs.values()) for (const run of group) {
        if (run.fontName !== name) continue;
        const token = strings.find((operand) => operand.start === run.stringStart);
        if (!token?.bytes) continue;
        let offset = 0;
        for (const glyph of model.decode(token.bytes)) {
          usedCodes.add(Buffer.from(token.bytes.slice(offset, offset + glyph.byteLen)).toString('hex'));
          offset += glyph.byteLen;
        }
      }
      for (const code of map.keys()) if (!usedCodes.has(code)) map.delete(code);
    }
    return { model, map, name: nameValue, encodingName, restricted };
  }
  const getFont = (name: string) => { if (!fontCache.has(name)) fontCache.set(name, fontInfo(name)); return fontCache.get(name)!; };
  let state: State = { charSpacing: source.initial.charSpacing, wordSpacing: source.initial.wordSpacing };
  const stack: State[] = [];
  const states = new Map<number, State>();
  for (const op of ops) {
    const nums = op.operands.filter((item) => item.t === 'num').map((item) => item.v!);
    if (op.op === 'q') stack.push({ ...state });
    if (op.op === 'Q') state = stack.pop() ?? { charSpacing: 0, wordSpacing: 0 };
    if (op.op === 'Tc') state.charSpacing = nums[0];
    if (op.op === 'Tw') state.wordSpacing = nums[0];
    if (op.op === '"') state = { wordSpacing: nums[0], charSpacing: nums[1] };
    states.set(op.index, { ...state });
  }
  return { doc, page, logical, ops, runs, extracted, getFont, states, PDFName, source };
}
type Context = Awaited<ReturnType<typeof contextFor>>;

function selectionFor(context: Context, op: Operation) {
  const runs = context.runs.get(op.index);
  const first = runs?.[0];
  if (!first || !first.fontSize || first.hScale <= 0 || first.renderMode >= 3) fail('Este texto está oculto, recortado o usa una orientación no compatible.');
  const font = context.getFont(first.fontName);
  if (!font.model || font.model.isType3 || (font.model.isComposite && font.encodingName !== 'Identity-H')) fail('La codificación de esta fuente todavía no permite una edición fiel.');
  const items = op.op === 'TJ' ? op.operands[0]?.items : op.operands.filter((item) => item.t === 'str');
  if (!items?.length || items.some((item) => !['str', 'num'].includes(item.t))) fail('La estructura de este fragmento no admite edición fiel.');
  const glyphs: Glyph[] = [];
  let pending = 0;
  for (const item of items) {
    if (item.t === 'num') { pending += item.v!; continue; }
    let offset = 0;
    for (const decoded of font.model.decode(item.bytes!)) {
      const bytes = item.bytes!.slice(offset, offset + decoded.byteLen); offset += decoded.byteLen;
      const text = font.map.get(Buffer.from(bytes).toString('hex'));
      if (!text) fail('No se pudo identificar con seguridad cada carácter de la fuente original.');
      glyphs.push({ text, bytes, width: decoded.width1000, space: decoded.isSingleByteSpace, kern: pending });
      pending = 0;
    }
    if (offset !== item.bytes!.length) fail('La fuente usa códigos de carácter no compatibles.');
  }
  let text = glyphs.map((glyph) => glyph.text).join('');
  const independentlyExtracted = context.extracted.runs.find((run) => run.text.trim() && Math.hypot(run.transform[4] - first.originDevice.x, run.transform[5] - first.originDevice.y) < .5);
  // Some generators draw word gaps as TJ displacements, with no space glyph.
  // Recover only whitespace independently recognized by PDF.js; the gap stays
  // a numeric displacement and does not require a new font character.
  if (independentlyExtracted && independentlyExtracted.text.replace(/\s/g, '') === text.replace(/\s/g, '')) {
    const visible = independentlyExtracted.text;
    const aligned: Glyph[] = [];
    let position = 0;
    for (const originalGlyph of glyphs) {
      const glyph = { ...originalGlyph };
      if (!/^\s/u.test(glyph.text)) {
        const gap = /^\s+/u.exec(visible.slice(position))?.[0];
        if (gap) {
          aligned.push({ text: gap, bytes: new Uint8Array(), width: 0, space: false, kern: glyph.kern, synthetic: true });
          glyph.kern = 0;
          position += gap.length;
        }
      }
      if (!visible.startsWith(glyph.text, position)) fail('No se pudo recuperar con seguridad el espaciado original.');
      position += glyph.text.length;
      aligned.push(glyph);
    }
    glyphs.splice(0, glyphs.length, ...aligned);
    text = glyphs.map((glyph) => glyph.text).join('');
  }
  if (independentlyExtracted) {
    const actual = independentlyExtracted.text.replace(/\s/g, '');
    const expected = text.replace(/\s/g, '');
    if (!actual.startsWith(expected) && !expected.startsWith(actual)) fail('La codificación original no coincide de forma fiable con el texto visible.');
  }
  const state = context.states.get(op.index)!;
  const scale = first.fontSize * first.hScale;
  const advance = (glyph: Glyph) => glyph.synthetic ? 0 : glyph.width + (state.charSpacing + (glyph.space ? state.wordSpacing : 0)) * 1000 / first.fontSize;
  const total = glyphs.reduce((sum, glyph) => sum - glyph.kern + advance(glyph), 0) - pending;
  const physicalScale = Math.hypot(first.trm.a, first.trm.b) / 1000;
  const height = Math.hypot(first.trm.c, first.trm.d);
  const x = first.originDevice.x, y = first.originDevice.y;
  const length = total * physicalScale;
  const ax = first.trm.a / Math.hypot(first.trm.a, first.trm.b), ay = first.trm.b / Math.hypot(first.trm.a, first.trm.b);
  const bx = first.trm.c / height, by = first.trm.d / height;
  const quad = [0, 1, 2, 3].map((i) => {
    const along = i === 1 || i === 2 ? length : 0;
    const up = i >= 2 ? .85 * height : -.2 * height;
    return [x + along * ax + up * bx, y + along * ay + up * by];
  });
  return { first, font, glyphs, trailing: pending, state, advance, total, physicalScale, quad, text, scale, height };
}

export async function inspectText(doc: PdfDocument, pageIndex: number) {
  const sources = await sourcesFor(doc, pageIndex);
  const extracted = await doc.getPage(pageIndex).text();
  const contexts = await Promise.all(sources.map((source) => contextFor(doc, pageIndex, source, extracted)));
  const texts: { index: number; text: string; editable: boolean; reason?: string; font?: string; size?: number; charSpacing?: number; wordSpacing?: number; horizontalScale?: number; kerningAdjustments?: number; quad?: number[][] }[] = [];
  const covered = new Set<TextRun>();
  for (const context of contexts) for (const op of context.ops) {
    if (!['Tj', 'TJ', "'", '"'].includes(op.op)) continue;
    try {
      const item = selectionFor(context, op);
      if (!item.text.trim()) continue;
      texts.push({ index: context.source.offset + op.index, text: item.text, editable: true, font: item.font.name, size: item.height, charSpacing: item.state.charSpacing, wordSpacing: item.state.wordSpacing, horizontalScale: item.first.hScale * 100, kerningAdjustments: item.glyphs.filter((glyph) => glyph.kern !== 0).length + (item.trailing ? 1 : 0), quad: item.quad });
      for (const run of context.extracted.runs) {
        if (item.text.replace(/\s/g, '').includes(run.text.replace(/\s/g, '')) && Math.hypot(run.transform[4] - item.first.originDevice.x, run.transform[5] - item.first.originDevice.y) < Math.max(2, item.total * item.physicalScale)) covered.add(run);
      }
    } catch (error) {
      const runs = context.runs.get(op.index) ?? [];
      for (const run of context.extracted.runs) {
        if (runs.some((native) => Math.hypot(run.transform[4] - native.originDevice.x, run.transform[5] - native.originDevice.y) < 1)) {
          covered.add(run);
          texts.push({ index: context.source.offset + op.index, text: run.text, editable: false, reason: error instanceof Error ? error.message : 'Este fragmento no admite edición fiel.' });
          break;
        }
      }
    }
  }
  for (const [index, run] of contexts[0].extracted.runs.entries()) {
    if (run.text.trim() && !covered.has(run)) texts.push({ index: -index - 1, text: run.text, editable: false, reason: 'No se pudo asociar este texto con una fuente y ubicación editables de forma fiable.' });
  }
  return texts;
}

export async function rewriteTextFaithfully(doc: PdfDocument, pageIndex: number, index: number, original: string, replacement: string) {
  const sources = await sourcesFor(doc, pageIndex);
  const source = sources.find((item) => index >= item.offset && index < item.offset + item.ops.length);
  if (!source) fail('El texto cambió. Vuelve a seleccionar el fragmento.');
  const context = await contextFor(doc, pageIndex, source);
  const op = context.ops.find((item) => item.index === index - source.offset);
  if (!op || !['Tj', 'TJ', "'", '"'].includes(op.op)) fail('El texto cambió. Vuelve a seleccionar el fragmento.');
  const item = selectionFor(context, op);
  if (item.text !== original) fail('El texto cambió. Vuelve a seleccionar el fragmento.');
  if (/[\r\n\t]/.test(replacement)) fail('Edita una línea por vez; un salto de línea cambiaría la distribución original.');
  const reverse = new Map<string, Uint8Array>();
  for (const [code, text] of item.font.map) if (!reverse.has(text)) reverse.set(text, new Uint8Array(Buffer.from(code, 'hex')));
  for (const glyph of item.glyphs) reverse.set(glyph.text, glyph.bytes);
  const keys = [...reverse.keys()].sort((a, b) => b.length - a.length);
  const next: Glyph[] = [];
  for (let position = 0; position < replacement.length;) {
    let text = keys.find((key) => replacement.startsWith(key, position));
    let bytes = text ? reverse.get(text)! : undefined;
    if (!bytes) {
      text = String.fromCodePoint(replacement.codePointAt(position)!);
      const encoded = item.font.restricted ? null : item.font.model!.encode(text);
      if (encoded && !encoded.missing.length) bytes = encoded.bytes;
    }
    if (!bytes) fail(`La fuente original no contiene «${String.fromCodePoint(replacement.codePointAt(position)!)}». No se sustituirá la tipografía.`);
    if (bytes.length === 0 && /^\s+$/u.test(text!)) {
      const originalGap = item.glyphs.find((glyph) => glyph.synthetic && glyph.text === text);
      next.push({ text: text!, bytes, width: 0, space: false, kern: originalGap?.kern ?? 0, synthetic: true });
      position += text!.length;
      continue;
    }
    const decoded = item.font.model!.decode(bytes);
    if (decoded.length !== 1) fail('La fuente no permite codificar este carácter de manera fiel.');
    next.push({ text: text!, bytes, width: decoded[0].width1000, space: decoded[0].isSingleByteSpace, kern: 0 });
    position += text!.length;
  }
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(next.length, item.glyphs.length) && next[prefix].text === item.glyphs[prefix].text) prefix++;
  while (suffix < Math.min(next.length, item.glyphs.length) - prefix && next[next.length - 1 - suffix].text === item.glyphs[item.glyphs.length - 1 - suffix].text) suffix++;
  // Keep unchanged words anchored, but do not pin a shared suffix inside a
  // changed word (e.g. 'original' -> 'final' must not become 'f    inal').
  while (suffix > 0) {
    const start = item.glyphs.length - suffix;
    if (/^\s/u.test(item.glyphs[start].text) || /\s$/u.test(item.glyphs[start - 1]?.text ?? '')) break;
    suffix--;
  }
  const oldEnd = item.glyphs.length - suffix, newEnd = next.length - suffix;
  for (let i = 0; i < next.length; i++) {
    if (i < prefix) next[i] = { ...item.glyphs[i] };
    else if (i >= newEnd) next[i] = { ...item.glyphs[oldEnd + i - newEnd] };
    else if (oldEnd - prefix === newEnd - prefix) next[i].kern = item.glyphs[i].kern;
    else if (i === prefix) next[i].kern = item.glyphs[prefix]?.kern ?? 0;
  }
  const oldWidth = item.glyphs.slice(prefix, oldEnd).reduce((sum, glyph) => sum + item.advance(glyph) - glyph.kern, 0);
  const newWidth = next.slice(prefix, newEnd).reduce((sum, glyph) => sum + item.advance(glyph) - glyph.kern, 0);
  // Never compress, reduce font size, or push untouched text to fit a change.
  // Same-width substitutions and shorter replacements keep the original layout.
  if ((newWidth - oldWidth) * item.physicalScale > .25) fail('El texto nuevo no cabe en el espacio original sin alterar tamaño o espaciado. Acórtalo para conservar el formato.');
  const parts: string[] = [];
  for (let i = 0; i < next.length; i++) {
    let kern = next[i].kern;
    if (suffix && i === newEnd) kern += newWidth - oldWidth;
    if (kern) parts.push(number(kern));
    parts.push(hex(next[i].bytes));
  }
  // Restore the exact original text pen, including Tc/Tw and TJ displacements,
  // so following show operators retain their positions even without a new Tm.
  const trailing = item.trailing + (suffix ? 0 : newWidth - oldWidth);
  if (trailing) parts.push(number(trailing));
  let before = '';
  if (op.op === "'") before = 'T*\n';
  if (op.op === '"') before = `${number(item.state.wordSpacing)} Tw\n${number(item.state.charSpacing)} Tc\nT*\n`;
  const edit = Buffer.from(`${before}[${parts.join(' ')}] TJ`, 'latin1');
  const rebuilt = Buffer.concat([context.logical.bytes.subarray(0, op.start), edit, context.logical.bytes.subarray(op.end)]);
  // Copy only the selected invocation's Form chain; retain transparency groups,
  // matrices, bounding boxes, and every other invocation/page unchanged.
  await writeSource(doc, pageIndex, source, rebuilt);
  return { font: item.font.name, size: item.height, preserved: true, warnings: [] as string[] };
}
