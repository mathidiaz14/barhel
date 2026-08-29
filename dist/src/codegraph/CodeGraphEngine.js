import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export class CodeGraphEngine {
    workdir;
    cachePath;
    graph;
    isLoaded = false;
    static IGNORED_DIRS = new Set([
        'node_modules',
        '.git',
        'dist',
        'build',
        'out',
        'vendor',
        '.dev-agent-sessions',
        '.barhel',
        'coverage',
        '.cache',
        '.temp',
        '.next',
        '.nuxt',
    ]);
    static SUPPORTED_EXTENSIONS = new Set([
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
        '.py',
        '.php',
        '.go',
        '.rs',
        '.java',
        '.json',
    ]);
    constructor(workdir = process.cwd()) {
        this.workdir = path.resolve(workdir);
        const barhelDir = path.join(this.workdir, '.barhel');
        if (!fs.existsSync(barhelDir)) {
            try {
                fs.mkdirSync(barhelDir, { recursive: true });
            }
            catch {
                // Silencioso
            }
        }
        this.cachePath = path.join(barhelDir, 'codegraph.json');
        this.graph = {
            version: 1,
            workdir: this.workdir,
            updatedAt: new Date().toISOString(),
            files: {},
            symbols: {},
            callGraph: {},
            callerGraph: {},
        };
    }
    /**
     * Carga el grafo desde disco o realiza un escaneo completo inicial
     */
    async ensureLoaded(forceRescan = false) {
        if (this.isLoaded && !forceRescan) {
            return this.graph;
        }
        if (!forceRescan && fs.existsSync(this.cachePath)) {
            try {
                const raw = fs.readFileSync(this.cachePath, 'utf-8');
                this.graph = JSON.parse(raw);
                this.isLoaded = true;
                return this.graph;
            }
            catch {
                // Si el archivo está corrupto, re-escanear
            }
        }
        await this.scan();
        return this.graph;
    }
    /**
     * Escanea todo el repositorio e indexa símbolos y dependencias
     */
    async scan() {
        const filePaths = this.collectSourceFiles(this.workdir);
        const filesMap = {};
        const symbolsMap = {};
        const callGraph = {};
        const callerGraph = {};
        for (const fullPath of filePaths) {
            const relPath = path.relative(this.workdir, fullPath).replace(/\\/g, '/');
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const hash = crypto.createHash('md5').update(content).digest('hex');
                const fileNode = this.parseFile(relPath, content, hash);
                filesMap[relPath] = fileNode;
                for (const sym of fileNode.symbols) {
                    if (!symbolsMap[sym.name]) {
                        symbolsMap[sym.name] = [];
                    }
                    symbolsMap[sym.name].push(sym);
                    if (sym.calls && sym.calls.length > 0) {
                        callGraph[sym.name] = sym.calls;
                        for (const called of sym.calls) {
                            if (!callerGraph[called]) {
                                callerGraph[called] = [];
                            }
                            if (!callerGraph[called].includes(sym.name)) {
                                callerGraph[called].push(sym.name);
                            }
                        }
                    }
                }
            }
            catch {
                // Ignorar archivos no legibles
            }
        }
        this.graph = {
            version: 1,
            workdir: this.workdir,
            updatedAt: new Date().toISOString(),
            files: filesMap,
            symbols: symbolsMap,
            callGraph,
            callerGraph,
        };
        this.saveCache();
        this.isLoaded = true;
        return this.graph;
    }
    /**
     * Parsea un archivo individual extrayendo símbolos, imports, exports y llamadas
     */
    parseFile(relPath, content, hash) {
        const lines = content.split('\n');
        const imports = [];
        const exports = [];
        const symbols = [];
        const ext = path.extname(relPath).toLowerCase();
        // Parseo para TypeScript / JavaScript
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineNum = i + 1;
                // 1. Imports
                const importMatch = line.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/);
                if (importMatch) {
                    imports.push(importMatch[1]);
                }
                // 2. Classes
                const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/);
                if (classMatch) {
                    const name = classMatch[1];
                    symbols.push({ name, kind: 'class', file: relPath, line: lineNum });
                    if (line.includes('export '))
                        exports.push(name);
                }
                // 3. Interfaces
                const interfaceMatch = line.match(/(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/);
                if (interfaceMatch) {
                    const name = interfaceMatch[1];
                    symbols.push({ name, kind: 'interface', file: relPath, line: lineNum });
                    if (line.includes('export '))
                        exports.push(name);
                }
                // 4. Type Aliases
                const typeMatch = line.match(/(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/);
                if (typeMatch) {
                    const name = typeMatch[1];
                    symbols.push({ name, kind: 'type', file: relPath, line: lineNum });
                    if (line.includes('export '))
                        exports.push(name);
                }
                // 5. Functions & Methods
                const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/);
                const arrowFnMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
                const methodMatch = line.match(/(?:public|private|protected|static|async)*\s*([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/);
                let fnName = null;
                let params = [];
                if (fnMatch) {
                    fnName = fnMatch[1];
                    params = fnMatch[2].split(',').map((p) => p.trim()).filter(Boolean);
                }
                else if (arrowFnMatch) {
                    fnName = arrowFnMatch[1];
                    params = arrowFnMatch[2].split(',').map((p) => p.trim()).filter(Boolean);
                }
                else if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(methodMatch[1])) {
                    fnName = methodMatch[1];
                    params = methodMatch[2].split(',').map((p) => p.trim()).filter(Boolean);
                }
                if (fnName && fnName.length > 1) {
                    const calls = this.extractCalls(lines.slice(i, Math.min(lines.length, i + 50)).join('\n'));
                    symbols.push({
                        name: fnName,
                        kind: 'function',
                        file: relPath,
                        line: lineNum,
                        params,
                        calls,
                    });
                    if (line.includes('export '))
                        exports.push(fnName);
                }
            }
        }
        else if (ext === '.py') {
            // Parseo básico para Python
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineNum = i + 1;
                const classMatch = line.match(/^class\s+([A-Za-z0-9_]+)/);
                if (classMatch) {
                    symbols.push({ name: classMatch[1], kind: 'class', file: relPath, line: lineNum });
                }
                const defMatch = line.match(/^\s*def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
                if (defMatch) {
                    symbols.push({
                        name: defMatch[1],
                        kind: 'function',
                        file: relPath,
                        line: lineNum,
                        params: defMatch[2].split(',').map((p) => p.trim()).filter(Boolean),
                    });
                }
            }
        }
        return {
            path: relPath,
            hash,
            size: content.length,
            imports,
            exports,
            symbols,
        };
    }
    /**
     * Extrae llamadas a funciones potenciales dentro de un bloque de código
     */
    extractCalls(block) {
        const callRegex = /([A-Za-z0-9_$]+)\s*\(/g;
        const calls = new Set();
        const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'import', 'require', 'typeof', 'console']);
        let match;
        while ((match = callRegex.exec(block)) !== null) {
            const sym = match[1];
            if (!reserved.has(sym) && sym.length > 2) {
                calls.add(sym);
            }
        }
        return Array.from(calls).slice(0, 15);
    }
    /**
     * Busca archivos recursivamente respetando exclusiones
     */
    collectSourceFiles(dir) {
        const results = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (CodeGraphEngine.IGNORED_DIRS.has(entry.name))
                    continue;
                if (entry.name.startsWith('.'))
                    continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results.push(...this.collectSourceFiles(fullPath));
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (CodeGraphEngine.SUPPORTED_EXTENSIONS.has(ext)) {
                        results.push(fullPath);
                    }
                }
            }
        }
        catch {
            // Ignorar errores de lectura
        }
        return results;
    }
    saveCache() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.graph, null, 2), 'utf-8');
        }
        catch {
            // Silencioso
        }
    }
    /**
     * CONSULTAS DE GRAFO
     */
    /**
     * Busca cualquier símbolo por nombre exacto o parcial
     */
    search(query) {
        const q = query.toLowerCase();
        const results = [];
        for (const [name, syms] of Object.entries(this.graph.symbols)) {
            if (name.toLowerCase().includes(q)) {
                results.push(...syms);
            }
        }
        return results;
    }
    /**
     * Obtiene la lista de quién llama a este símbolo (Callers)
     */
    getCallers(symbolName) {
        return this.graph.callerGraph[symbolName] || [];
    }
    /**
     * Obtiene la lista de qué símbolos son llamados por este símbolo (Callees)
     */
    getCallees(symbolName) {
        return this.graph.callGraph[symbolName] || [];
    }
    /**
     * Resumen ejecutivo del mapa de arquitectura del repositorio
     */
    getHierarchy() {
        const lines = [];
        lines.push(`# CodeGraph Architecture Map: ${path.basename(this.workdir)}`);
        lines.push(`Total de archivos indexados: ${Object.keys(this.graph.files).length}`);
        lines.push(`Total de símbolos: ${Object.keys(this.graph.symbols).length}\n`);
        for (const [file, node] of Object.entries(this.graph.files)) {
            if (node.symbols.length === 0)
                continue;
            lines.push(`📄 ${file}`);
            for (const sym of node.symbols) {
                const paramStr = sym.params ? `(${sym.params.join(', ')})` : '';
                lines.push(`   └─ [${sym.kind}] ${sym.name}${paramStr} (línea ${sym.line})`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Información completa de un símbolo para el agente
     */
    inspectSymbol(symbolName) {
        const syms = this.graph.symbols[symbolName];
        if (!syms || syms.length === 0) {
            return `Símbolo "${symbolName}" no encontrado en CodeGraph.`;
        }
        const callers = this.getCallers(symbolName);
        const callees = this.getCallees(symbolName);
        const lines = [];
        lines.push(`[CODEGRAPH SYMBOL: ${symbolName}]`);
        for (const s of syms) {
            lines.push(`• Archivo: ${s.file}:${s.line} (${s.kind})`);
            if (s.params)
                lines.push(`  Parámetros: (${s.params.join(', ')})`);
        }
        if (callers.length > 0) {
            lines.push(`• Invocado por (${callers.length}): ${callers.join(', ')}`);
        }
        if (callees.length > 0) {
            lines.push(`• Invoca a (${callees.length}): ${callees.join(', ')}`);
        }
        return lines.join('\n');
    }
}
//# sourceMappingURL=CodeGraphEngine.js.map