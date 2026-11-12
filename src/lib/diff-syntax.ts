type Token = { text: string; kind?: "comment" | "string" | "keyword" | "number" };

const codeFile = /\.(?:[cm]?[jt]sx?|rs|py|rb|go|swift|java|kt|cs|cpp|c|h|css|scss|jsonc?|ya?ml|toml|sh|zsh|sql)$/i;
const keywords = new Set("async await break case class const continue def else enum export false fn for from func if impl import in let match mod new nil None null package pub return self static struct switch throw trait true try type undefined use var void while yield False True".split(" "));
const tokenPattern = /\/\/.*|\/\*.*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b|[A-Za-z_$][\w$]*/g;

const hashTokenPattern = new RegExp(`#.*|${tokenPattern.source}`, "g");

export function diffSyntax(text: string, path: string): Token[] {
  if (text.length > 2000 || !codeFile.test(path)) return [{ text }];
  const hashComments = /\.(?:py|rb|ya?ml|toml|sh|zsh)$/i.test(path);
  const pattern = hashComments ? hashTokenPattern : tokenPattern;
  const tokens: Token[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const kind = value.startsWith("//") || value.startsWith("/*") || (hashComments && value.startsWith("#")) ? "comment"
      : /^["'`]/.test(value) ? "string"
      : /^\d/.test(value) ? "number"
      : keywords.has(value) ? "keyword" : undefined;
    if (!kind) continue;
    if (match.index > offset) tokens.push({ text: text.slice(offset, match.index) });
    tokens.push({ text: value, kind });
    offset = match.index + value.length;
  }
  if (offset < text.length) tokens.push({ text: text.slice(offset) });
  return tokens;
}
