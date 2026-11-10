import { readFileSync, readdirSync } from 'node:fs';
// Static check: every unbounded-looking loop and every recursive function in src/ either
// ticks the budget or says why it is bounded.
export function scan(dir) {
  const problems = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const lines = readFileSync(`${dir}/${file}`, 'utf8').split('\n');
    const excused = (i) => /\/\/ bounded:/.test(lines[i]) || (i > 0 && /^\s*\/\/ bounded:/.test(lines[i - 1]));
    // the text of the block that opens on line i (to the matching brace), or the line itself
    const block = (i) => {
      let depth = 0, started = false, out = [];
      for (let j = i; j < lines.length; j++) { // bounded: the lines of one file
        out.push(lines[j]);
        for (const ch of lines[j].replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '').replace(/\/\/.*$/, '')) {
          if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--;
        }
        if (started ? depth <= 0 : j > i) break;
      }
      return out.join('\n');
    };
    const ticks = (text) => /\.tick\(|\btick\(\)|_guard\(/.test(text);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\bwhile\s*\(|\bfor\s*\(\s*;\s*;/.test(code) && !excused(i) && !ticks(block(i))) problems.push(`${file}:${i + 1} loop: ${line.trim()}`);
      const def = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|\*\s*)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*(?:\/\/.*)?$/.exec(line)
        || /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b[^{]*|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*\{\s*(?:\/\/.*)?$/.exec(line);
      if (def && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(def[1])) {
        const body = block(i).split('\n').slice(1).join('\n').replace(/\/\/.*$/gm, '');
        const self = new RegExp(`(?:^|[^\\w$.])(?:this\\.)?${def[1].replace(/\$/g, '\\$')}\\(`);
        if (self.test(body) && !excused(i) && !/\/\/ bounded:/.test(block(i)) && !ticks(body)) problems.push(`${file}:${i + 1} recursion: ${def[1]}`);
      }
    });
  }
  return problems;
}
if (process.argv[2]) console.log(scan(process.argv[2]).join('\n') || 'clean');
