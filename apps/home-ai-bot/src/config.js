import fs from 'node:fs';

function integer(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function secret(fileVariable, optional = false) {
  const filename = process.env[fileVariable];
  if (!filename) {
    if (optional) return '';
    throw new Error(`${fileVariable} is required.`);
  }
  try {
    const value = fs.readFileSync(filename, 'utf8').trim();
    if (!value && !optional) throw new Error(`${fileVariable} is empty.`);
    return value;
  } catch (error) {
    if (optional && error.code === 'ENOENT') return '';
    throw error;
  }
}

export function loadConfig() {
  const allowedUserId = integer('ALLOWED_TELEGRAM_USER_ID');
  const allowedChatId = integer('ALLOWED_TELEGRAM_CHAT_ID', allowedUserId);
  if (allowedUserId !== allowedChatId) throw new Error('Only a private chat whose ID equals the allowed user is supported.');
  return {
    allowedUserId,
    allowedChatId,
    databasePath: required('DATABASE_PATH'),
    localLlm: {
      baseUrl: required('RKLLM_BASE_URL'),
      model: required('RKLLM_MODEL'),
      timeoutMs: integer('RKLLM_TIMEOUT_MS', 45_000),
      maxTokens: integer('RKLLM_MAX_NEW_TOKENS', 512),
    },
    braveDailyLimit: integer('BRAVE_DAILY_LIMIT', 100),
    deepSeekDailyLimit: integer('DEEPSEEK_DAILY_LIMIT', 100),
    deepSeekMaxTokens: integer('DEEPSEEK_MAX_TOKENS', 1500),
    deepSeekBaseUrl: required('DEEPSEEK_BASE_URL'),
    historyTtlDays: integer('HISTORY_TTL_DAYS', 7),
    historyMaxMessages: integer('HISTORY_MAX_MESSAGES', 30),
    auditTtlDays: integer('AUDIT_TTL_DAYS', 30),
    qbittorrentUrl: required('QBITTORRENT_URL'),
    actionBrokerSocket: required('ACTION_BROKER_SOCKET'),
    routerApiUrl: process.env.ROUTER_API_URL ?? 'http://192.168.1.1:9090',
    routerVpnSelector: process.env.ROUTER_VPN_SELECTOR ?? 'Moscow',
    telegramToken: secret('TELEGRAM_BOT_TOKEN_FILE'),
    pairingSecret: secret('PAIRING_SECRET_FILE'),
    braveApiKey: secret('BRAVE_API_KEY_FILE'),
    deepSeekApiKey: secret('DEEPSEEK_API_KEY_FILE', true),
    actionBrokerToken: secret('ACTION_BROKER_TOKEN_FILE'),
    qbittorrentUsername: secret('QBITTORRENT_USERNAME_FILE'),
    qbittorrentPassword: secret('QBITTORRENT_PASSWORD_FILE'),
  };
}
