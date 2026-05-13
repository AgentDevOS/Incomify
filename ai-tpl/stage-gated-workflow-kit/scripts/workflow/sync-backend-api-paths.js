#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.join('.workflow', 'test-contract.json');
const BACKEND_ROOT = path.join('src', 'backend');
const HTTP_METHODS = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']);

function normalizePath(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

function joinPaths(prefix, routePath) {
  const normalizedPrefix = normalizePath(prefix);
  const normalizedRoute = normalizePath(routePath);

  if (!normalizedPrefix || normalizedPrefix === '/') {
    return normalizedRoute || '/';
  }

  if (!normalizedRoute || normalizedRoute === '/') {
    return normalizedPrefix;
  }

  return normalizePath(`${normalizedPrefix}/${normalizedRoute.replace(/^\//, '')}`);
}

function listRustFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const visit = currentDir => {
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach(entry => {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        return;
      }

      if (entry.isFile() && entry.name.endsWith('.rs')) {
        files.push(absolutePath);
      }
    });
  };

  visit(rootDir);
  return files.sort();
}

function stripRustComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findMatchingDelimiter(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelArgs(argsText) {
  const args = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;

    if (char === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      args.push(argsText.slice(start, index).trim());
      start = index + 1;
    }
  }

  args.push(argsText.slice(start).trim());
  return args;
}

function readFirstStringLiteral(text) {
  const match = String(text || '').match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
  return match ? match[1].replace(/\\"/g, '"') : '';
}

function extractMethods(handlerExpression) {
  const methods = new Set();
  const regex = /\b(delete|get|head|options|patch|post|put|trace)\s*\(/g;
  let match;

  while ((match = regex.exec(handlerExpression)) !== null) {
    const method = match[1];
    if (HTTP_METHODS.has(method)) {
      methods.add(method.toUpperCase());
    }
  }

  return Array.from(methods);
}

function extractFunctionCalls(expression) {
  const calls = [];
  const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match;

  while ((match = regex.exec(expression)) !== null) {
    if (!HTTP_METHODS.has(match[1])) {
      calls.push(match[1]);
    }
  }

  return calls;
}

function extractCallArgs(body, callName) {
  const calls = [];
  const needle = `.${callName}(`;
  let cursor = 0;

  while (cursor < body.length) {
    const callIndex = body.indexOf(needle, cursor);
    if (callIndex === -1) {
      break;
    }

    const openIndex = callIndex + needle.length - 1;
    const closeIndex = findMatchingDelimiter(body, openIndex, '(', ')');
    if (closeIndex === -1) {
      cursor = openIndex + 1;
      continue;
    }

    calls.push(body.slice(openIndex + 1, closeIndex));
    cursor = closeIndex + 1;
  }

  return calls;
}

function extractFunctions(source) {
  const functions = new Map();
  const clean = stripRustComments(source);
  const regex = /\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:->\s*[^{]+)?\{/g;
  let match;

  while ((match = regex.exec(clean)) !== null) {
    const name = match[1];
    const openIndex = clean.indexOf('{', match.index);
    const closeIndex = findMatchingDelimiter(clean, openIndex, '{', '}');
    if (closeIndex === -1) {
      continue;
    }

    functions.set(name, clean.slice(openIndex + 1, closeIndex));
    regex.lastIndex = closeIndex + 1;
  }

  return functions;
}

function parseFunctionBody(body) {
  const routes = [];
  const nests = [];

  extractCallArgs(body, 'route').forEach(argsText => {
    const args = splitTopLevelArgs(argsText);
    const routePath = readFirstStringLiteral(args[0]);
    const methods = extractMethods(args[1] || '');

    methods.forEach(method => {
      routes.push({
        method,
        path: normalizePath(routePath),
      });
    });
  });

  extractCallArgs(body, 'nest').forEach(argsText => {
    const args = splitTopLevelArgs(argsText);
    const prefix = readFirstStringLiteral(args[0]);
    const calls = extractFunctionCalls(args[1] || '');
    calls.forEach(functionName => {
      nests.push({
        prefix: normalizePath(prefix),
        functionName,
      });
    });
  });

  return { routes, nests };
}

function collectRoutes(functionName, functions, parsedFunctions, prefix = '', visiting = new Set()) {
  if (!functions.has(functionName) || visiting.has(functionName)) {
    return [];
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(functionName);

  const parsed = parsedFunctions.get(functionName) || { routes: [], nests: [] };
  const routes = parsed.routes.map(route => ({
    method: route.method,
    path: joinPaths(prefix, route.path),
  }));

  parsed.nests.forEach(nest => {
    routes.push(...collectRoutes(
      nest.functionName,
      functions,
      parsedFunctions,
      joinPaths(prefix, nest.prefix),
      nextVisiting
    ));
  });

  return routes;
}

function uniqueAndSortRoutes(routes) {
  const unique = new Map();
  routes.forEach(route => {
    if (!route.method || !route.path) {
      return;
    }
    unique.set(`${route.method} ${route.path}`, {
      method: route.method,
      path: route.path,
    });
  });

  return Array.from(unique.values()).sort((left, right) => (
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
  ));
}

function discoverBackendApiPaths(root = process.cwd()) {
  const backendRoot = path.join(root, BACKEND_ROOT);
  const functions = new Map();

  listRustFiles(backendRoot).forEach(filePath => {
    extractFunctions(fs.readFileSync(filePath, 'utf8')).forEach((body, name) => {
      functions.set(name, body);
    });
  });

  const parsedFunctions = new Map();
  const referencedFunctions = new Set();

  functions.forEach((body, name) => {
    const parsed = parseFunctionBody(body);
    parsedFunctions.set(name, parsed);
    parsed.nests.forEach(nest => referencedFunctions.add(nest.functionName));
  });

  const rootFunctions = Array.from(functions.keys()).filter(name => !referencedFunctions.has(name));
  const routes = [];

  rootFunctions.forEach(functionName => {
    routes.push(...collectRoutes(functionName, functions, parsedFunctions));
  });

  return uniqueAndSortRoutes(routes);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function syncBackendApiPaths(root = process.cwd()) {
  const contractPath = path.join(root, CONTRACT_PATH);
  const contract = readJsonIfExists(contractPath);
  const apiPaths = discoverBackendApiPaths(root);

  const nextContract = {
    version: contract.version || 1,
    ...contract,
    backend: {
      ...(contract.backend && typeof contract.backend === 'object' ? contract.backend : {}),
      language: 'rust',
      framework: 'axum',
      database: 'sqlite',
      apiPaths,
    },
  };

  const previous = JSON.stringify(contract, null, 2) + '\n';
  const next = JSON.stringify(nextContract, null, 2) + '\n';
  const updated = previous !== next;

  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  fs.writeFileSync(contractPath, next, 'utf8');

  return {
    updated,
    apiPaths,
    contractPath,
  };
}

function main() {
  const result = syncBackendApiPaths(process.cwd());
  console.log(`已同步 ${result.apiPaths.length} 个后端 API 到 ${CONTRACT_PATH}`);
  result.apiPaths.forEach(route => {
    console.log(`- ${route.method} ${route.path}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  discoverBackendApiPaths,
  syncBackendApiPaths,
};
