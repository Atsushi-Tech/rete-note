// フロントマター（YAMLのごく一部: key: value / key: [a, b] / true・false）を読み書きします。
export function parseFrontMatter(raw, file = '') {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: 先頭に --- で囲んだフロントマターが必要です`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      data[k] = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (v === 'true' || v === 'false') {
      data[k] = v === 'true';
    } else {
      data[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  return { data, body: m[2] };
}

export function stringifyFrontMatter(data, body) {
  const lines = Object.entries(data).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}
