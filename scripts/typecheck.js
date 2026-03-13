const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const tsconfigPath = join(process.cwd(), 'tsconfig.json');
if (!existsSync(tsconfigPath)) {
  console.log('TYPECHECK_SKIP: tsconfig.json 不存在');
  process.exit(0);
}

const cmd = process.platform === 'win32'
  ? 'npm exec -- tsc --noEmit --pretty false'
  : 'npm exec -- tsc --noEmit --pretty false';

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
