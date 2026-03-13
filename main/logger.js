const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = process.env.LOG_LEVEL && LEVELS[process.env.LOG_LEVEL.toLowerCase()]
  ? LEVELS[process.env.LOG_LEVEL.toLowerCase()]
  : LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function log(level, context, message, meta) {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    context,
    message,
    ...(meta ? { meta } : {})
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function createLogger(context) {
  return {
    debug: (message, meta) => log('debug', context, message, meta),
    info: (message, meta) => log('info', context, message, meta),
    warn: (message, meta) => log('warn', context, message, meta),
    error: (message, meta) => log('error', context, message, meta)
  };
}

module.exports = { createLogger };
