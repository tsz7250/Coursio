const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const tsconfigPath = join(process.cwd(), 'tsconfig.json');
if (!existsSync(tsconfigPath)) {
  console.log('TYPECHECK_SKIP: tsconfig.json 不存在');
  process.exit(0);
}

console.log('Running ESLint...');
const lintResult = spawnSync('npm run lint', {
  stdio: 'inherit',
  shell: true
});

if (lintResult.error) {
  console.error('LINT_FAIL:', lintResult.error.message);
  process.exit(1);
}
if (lintResult.status !== 0) {
  console.error('LINT_FAIL: ESLint 檢查未通過');
  process.exit(lintResult.status || 1);
}

console.log('Running TypeScript syntax check...');
const cmd = 'npm exec -- tsc --noEmit --pretty false';

const result = spawnSync(cmd, {
  stdio: 'inherit',
  shell: true
});

if (result.error) {
  console.error('TYPECHECK_FAIL:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('TYPECHECK_OK');

