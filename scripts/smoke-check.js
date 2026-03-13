const { getBackend } = require('../main/backend_provider');

async function run() {
  const backendA = getBackend();
  const backendB = getBackend();

  if (backendA !== backendB) {
    throw new Error('Backend singleton 驗證失敗');
  }

  const requiredMethods = [
    'loginService',
    'getCourseListFromYZUApi',
    'queryCourseByDept',
    'puppeteerGetGrades',
    'getCourseSchedule'
  ];

  for (const name of requiredMethods) {
    if (typeof backendA[name] !== 'function') {
      throw new Error(`Backend 缺少必要方法: ${name}`);
    }
  }

  console.log('SMOKE_OK: backend singleton + facade methods');
}

run().catch((err) => {
  console.error('SMOKE_FAIL:', err.message);
  process.exit(1);
});
