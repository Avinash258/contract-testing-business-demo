/**
 * filter-branch helpers
 *   msg — strip Cursor / bot co-author trailers
 *   env — set author/committer to aviAI <avi@world.com> for Cursor-attributed commits
 *   env-all — set ALL commits to aviAI <avi@world.com>
 */
const mode = process.argv[2];

if (mode === 'msg') {
  let d = '';
  process.stdin.on('data', (c) => {
    d += c;
  });
  process.stdin.on('end', () => {
    const out = d
      .replace(/\r?\nCo-authored-by:\s*Cursor\s*<cursoragent@cursor\.com>/gi, '')
      .replace(/\r?\nCo-authored-by:\s*Cursor Agent\s*<[^>\n]+>/gi, '')
      .replace(/\r?\nCo-authored-by:\s*cursoragent\s*<[^>\n]+>/gi, '')
      .replace(/\n{3,}/g, '\n\n');
    process.stdout.write(out.endsWith('\n') ? out : `${out}\n`);
  });
} else if (mode === 'env' || mode === 'env-all') {
  const name = process.env.GIT_AUTHOR_NAME || '';
  const email = (process.env.GIT_AUTHOR_EMAIL || '').toLowerCase();
  const cname = process.env.GIT_COMMITTER_NAME || '';
  const cemail = (process.env.GIT_COMMITTER_EMAIL || '').toLowerCase();

  const touchesCursor =
    /cursor/i.test(name) ||
    /cursor/i.test(cname) ||
    email.includes('cursor') ||
    cemail.includes('cursor') ||
    email === 'cursoragent@cursor.com';

  if (mode === 'env-all' || touchesCursor) {
    process.stdout.write(
      `export GIT_AUTHOR_NAME='aviAI'\n` +
        `export GIT_AUTHOR_EMAIL='avi@world.com'\n` +
        `export GIT_COMMITTER_NAME='aviAI'\n` +
        `export GIT_COMMITTER_EMAIL='avi@world.com'\n`
    );
  }
} else {
  console.error('Usage: node scripts/rewrite-authors.js msg|env|env-all');
  process.exit(1);
}
