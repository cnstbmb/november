import { ActionBrokerClient } from './action-broker-client.js';
import { ActionExecutor } from './action-executor.js';
import { loadConfig } from './config.js';
import { Jarvis } from './jarvis.js';
import { DeepSeekLlm, LocalLlm } from './llm.js';
import { QbittorrentClient } from './qbittorrent.js';
import { PersistentStore } from './store.js';
import { TelegramClient } from './telegram.js';
import { VpnGuard } from './vpn-guard.js';
import { WebResearch } from './web-research.js';

const config = loadConfig();
const store = new PersistentStore(config.databasePath, {
  historyTtlDays: config.historyTtlDays,
  historyMaxMessages: config.historyMaxMessages,
  auditTtlDays: config.auditTtlDays,
});

const localLlm = new LocalLlm({
  ...config.localLlm,
  store,
  userId: config.allowedUserId,
});
const cloudLlm = config.deepSeekApiKey
  ? new DeepSeekLlm({
    baseUrl: config.deepSeekBaseUrl,
    apiKey: config.deepSeekApiKey,
    dailyLimit: config.deepSeekDailyLimit,
    maxTokens: config.deepSeekMaxTokens,
    limiter: store,
  })
  : null;
const vpnGuard = new VpnGuard({
  routerApiUrl: config.routerApiUrl,
  selector: config.routerVpnSelector,
  probeUrl: 'https://api.search.brave.com',
});
const webResearch = new WebResearch({
  apiKey: config.braveApiKey,
  vpnGuard,
  limiter: store,
  dailyLimit: config.braveDailyLimit,
});
const qbittorrent = new QbittorrentClient({
  baseUrl: config.qbittorrentUrl,
  username: config.qbittorrentUsername,
  password: config.qbittorrentPassword,
});
const broker = new ActionBrokerClient({
  socketPath: config.actionBrokerSocket,
  token: config.actionBrokerToken,
});
const actions = new ActionExecutor({ broker, qbittorrent, audit: store });
const jarvis = new Jarvis({
  allowedUserId: config.allowedUserId,
  allowedChatId: config.allowedChatId,
  pairingSecret: config.pairingSecret,
  access: store,
  localLlm,
  cloudLlm,
  webResearch,
  actions,
  torrents: qbittorrent,
  systemStatus: broker,
  vpnGuard,
});
const telegram = new TelegramClient({
  token: config.telegramToken,
  handler: (update) => jarvis.handle(update),
});

function shutdown() {
  telegram.stop();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

console.log('Jarvis bot started in private-chat mode.');
await telegram.run();
store.cleanup();
store.close();
