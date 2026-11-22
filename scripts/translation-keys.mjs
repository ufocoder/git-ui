import { parse } from '@babel/parser';

function strings(expression) {
  if (!expression) return [];
  if (expression.type === 'StringLiteral') return [expression.value];
  if (expression.type === 'TemplateLiteral' && !expression.expressions.length) return [expression.quasis[0].value.cooked];
  if (expression.type === 'ConditionalExpression') return [...strings(expression.consequent), ...strings(expression.alternate)];
  if (expression.type === 'LogicalExpression') return [...strings(expression.left), ...strings(expression.right)];
  if (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(expression.type)) return strings(expression.expression);
  return [];
}

export function translationKeys(filename, source) {
  // Rust call sites are deliberately separate from the TypeScript parser.
  if (filename.endsWith('.rs')) return [...source.matchAll(/\b(?:locale::text|locale::format|failure)\(\s*"([a-z0-9.-]+)"/g)].map(match => match[1]);
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', ...(filename.endsWith('.tsx') ? ['jsx'] : [])] });
  const keys = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't') {
      for (const key of strings(node.arguments[0])) keys.add(key);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'loc'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return [...keys];
}
