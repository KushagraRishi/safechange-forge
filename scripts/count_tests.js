// Runs both test suites and writes logs/tests.json, so the test count in the
// pitch is a measured number that check_claims.js can verify.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
};
const js = run('npm test --silent 2>&1');
const num = (re, s) => Number((s.match(re) || [])[1] || 0);
const py = run(`${process.env.PYTHON || 'ml/.venv/bin/python'} -m unittest discover -s ml -p "test_*.py" 2>&1`);
const out = {
  js_tests: num(/ℹ tests (\d+)/, js),
  js_pass: num(/ℹ pass (\d+)/, js),
  js_fail: num(/ℹ fail (\d+)/, js),
  py_tests: num(/Ran (\d+) tests?/, py),
  py_ok: /\nOK/.test(py),
};
out.total_tests = out.js_tests + out.py_tests;
out.all_pass = out.js_fail === 0 && out.py_ok;
writeFileSync(new URL('../logs/tests.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(out);
process.exit(out.all_pass ? 0 : 1);
