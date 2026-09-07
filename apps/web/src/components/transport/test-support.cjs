// Load TypeScript with the project's compiler and inject only I/O boundaries.
// React itself is real: effects, state updates and rerenders run in the renderer.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

exports.loadTransportModule = function loadTransportModule(entry, mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText;
    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const base = specifier.startsWith('@/')
          ? path.resolve(__dirname, '../..', specifier.slice(2))
          : path.resolve(path.dirname(file), specifier);
        const resolved = [base, base + '.ts', base + '.tsx'].find(
          (candidate) =>
            fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
        );
        if (!resolved) throw new Error(`Cannot load ${specifier} from ${file}`);
        return load(resolved);
      }
      return require(specifier);
    };
    new Function('require', 'module', 'exports', code)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }
  return load(path.resolve(__dirname, entry));
};
