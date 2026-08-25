import crypto from 'node:crypto';

import { ActionPolicy, PolicyError } from './action-policy.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reply(text, buttons = []) {
  return { text, buttons };
}

const HELP_TEXT = [
  'Я локальный Jarvis на NanoPi. Реально умею:',
  '• отвечать локальной LLM без отправки диалога в облако;',
  '• /search запрос — искать через Brave и VPN;',
  '• /cloud вопрос — явно спросить DeepSeek, если он настроен;',
  '• /health — кратко доложить общую обстановку по NanoPi;',
  '• /status — показать реальные RAM, swap, диск, температуру, load average и uptime NanoPi;',
  '• /storage — показать свободное место на системе, SSD, HDD и разделе логов;',
  '• /services — проверить Docker, SSH, DNS и важные контейнеры;',
  '• /network — показать IP, шлюз, DNS, UFW и доступность Brave через VPN;',
  '• /torrents — показать задачи qBittorrent;',
  '• управлять qBittorrent только после подтверждения;',
  '• перезапускать Samba, qBittorrent и Jellyfin после подтверждения;',
  '• /clear — удалить историю; /privacy — показать параметры хранения.',
  '',
  'SSH, DNS, firewall и маршрутизацию я только диагностирую — управлять ими не могу.',
  'У меня нет управления замками или сигнализацией.',
].join('\n');

function isCapabilityQuestion(text) {
  return /(?:что|чего)\s+(?:ты\s+)?умеешь|расскажи.{0,20}(?:возможност|умеешь)|твои\s+возможности/i.test(text);
}

function isTorrentInventoryQuestion(text) {
  if (/(?:скачай|скачать|загрузи|загрузить|добавь|добавить|удали|удалить|останови|остановить|возобнови|возобновить|перепроверь|перепроверить)/i.test(text)) {
    return false;
  }
  return text === '/torrents'
    || /(?:что|чо|чё|че|какие|покажи|список).{0,40}(?:скачан|загруз|торрент|qbittorrent)/i.test(text)
    || /(?:скачан|загруз|торрент|qbittorrent).{0,40}(?:у меня|покажи|список)/i.test(text);
}

function isSystemStatusQuestion(text) {
  return text === '/status'
    || /(?:температур|греет|греется|горяч|нагрузк|load\s*average|аптайм|uptime|swap|своп)/i.test(text)
    || /(?:сколько|свобод|занят|использ).{0,40}(?:оперативн|ram|памят)/i.test(text)
    || /(?:оперативн|ram|памят).{0,40}(?:сколько|свобод|занят|использ)/i.test(text);
}

function isStorageQuestion(text) {
  return text === '/storage'
    || /(?:сколько|свобод|мест|забит).{0,40}(?:диск|ssd|hdd|накопител)/i.test(text)
    || /(?:диск|ssd|hdd|накопител).{0,40}(?:сколько|свобод|мест|забит)/i.test(text);
}

function isServiceQuestion(text) {
  return text === '/services'
    || /(?:что|как|все|всё|какие).{0,30}(?:сервис|служб|контейнер)/i.test(text)
    || /(?:сервис|служб|контейнер).{0,40}(?:работ|жив|состоя|здоров)/i.test(text)
    || /(?:samba|qbittorrent|jellyfin|remnanode|jarvis|rkllm|docker|ssh).{0,30}(?:работ|жив|состоя)/i.test(text);
}

function isNetworkQuestion(text) {
  return text === '/network'
    || /(?:dns|днс|vpn|впн|шлюз|gateway|маршрут|firewall|ufw)/i.test(text)
    || /(?:ip|айпи).{0,20}(?:адрес|короб|nanopi)/i.test(text)
    || /(?:трафик|интернет).{0,30}(?:роутер|маршрут|ид[её]т)/i.test(text);
}

function isHealthQuestion(text) {
  return text === '/health'
    || /^(?:доложи\s+обстановку|как(?:\s+там)?\s+дела)[?!. ]*$/i.test(text)
    || /(?:доложи|расскажи).{0,30}(?:обстановк|состояни).{0,30}(?:короб|nanopi|нод)/i.test(text)
    || /(?:как|что).{0,20}(?:короб|nanopi|нод).{0,20}(?:дел|состояни|здоров)/i.test(text)
    || /(?:вс[её]\s+ли).{0,20}(?:хорошо|работает).{0,20}(?:короб|nanopi|нод)/i.test(text);
}

function formatGiB(bytes) {
  return `${(Number(bytes) / 1024 ** 3).toFixed(1)} GiB`;
}

function formatSystemStatus(status) {
  const memory = status.memory ?? {};
  const swap = status.swap ?? {};
  const disk = status.disk ?? {};
  const load = Array.isArray(status.loadAverage) ? status.loadAverage : [];
  const uptimeDays = Number(status.uptimeSeconds ?? 0) / 86_400;
  return [
    `RAM: ${formatGiB(memory.availableBytes)} свободно из ${formatGiB(memory.totalBytes)}.`,
    `Swap: ${formatGiB(swap.freeBytes)} свободно из ${formatGiB(swap.totalBytes)}.`,
    `Диск: ${formatGiB(disk.freeBytes)} свободно из ${formatGiB(disk.totalBytes)}.`,
    `Температура: ${Number(status.temperatureCelsius).toFixed(1)} °C.`,
    `Load average: ${load.map((value) => Number(value).toFixed(2)).join(' / ')}.`,
    `Uptime: ${uptimeDays.toFixed(1)} суток.`,
  ].join('\n');
}

function formatStorage(status) {
  const volumes = Array.isArray(status.volumes) ? status.volumes : [];
  if (volumes.length === 0) return 'Доступные накопители не найдены.';
  return volumes.map((volume) => {
    const total = Number(volume.totalBytes);
    const free = Number(volume.freeBytes);
    const freePercent = total > 0 ? Math.round((free / total) * 100) : 0;
    return `${volume.name} (${volume.mountPoint}): ${formatGiB(free)} свободно из ${formatGiB(total)} — ${freePercent}%.`;
  }).join('\n');
}

function formatServices(status) {
  const services = Array.isArray(status.services) ? status.services : [];
  if (services.length === 0) return 'Состояние сервисов недоступно.';
  const lines = services.map((service) => {
    const health = service.health ? ` (${service.health})` : '';
    return `${service.ok ? '✅' : '❌'} ${service.name}: ${service.state}${health}`;
  });
  lines.push('', status.allHealthy ? 'Все проверяемые сервисы работают.' : 'Есть проблемы с сервисами.');
  return lines.join('\n');
}

function formatNetwork(status, vpnAvailable) {
  const dnsServers = Array.isArray(status.dnsServers) ? status.dnsServers.join(', ') : 'неизвестно';
  const vpnState = vpnAvailable === true ? 'доступен' : 'временно недоступен';
  return [
    `IP: ${status.ipv4Address || 'неизвестно'} (${status.interface || 'неизвестно'})`,
    `Шлюз: ${status.gateway || 'неизвестно'}`,
    `DNS: ${dnsServers || 'неизвестно'}`,
    `DNS через роутер: ${status.dnsUsesRouter ? 'да' : 'нет'}`,
    `UFW: ${status.firewallActive ? 'активен' : 'неактивен или недоступен'}`,
    `Brave через VPN: ${vpnState}`,
  ].join('\n');
}

function formatHealth({ system, storage, services, network, vpnAvailable }) {
  const volumes = Array.isArray(storage.volumes) ? storage.volumes : [];
  const diskParts = volumes.map((volume) => {
    const percent = Number(volume.totalBytes) > 0
      ? Math.round((Number(volume.freeBytes) / Number(volume.totalBytes)) * 100)
      : 0;
    return { name: volume.name, percent };
  });
  const serviceItems = Array.isArray(services.services) ? services.services : [];
  const failedServices = serviceItems.filter((service) => !service.ok).map((service) => service.name);
  const healthyServices = serviceItems.length - failedServices.length;
  const temperature = Number(system.temperatureCelsius);
  const needsAttention = failedServices.length > 0
    || diskParts.some((volume) => volume.percent < 10)
    || temperature >= 70
    || !network.dnsUsesRouter
    || !network.firewallActive
    || !vpnAvailable;
  return [
    needsAttention ? '⚠️ NanoPi требует внимания' : '✅ NanoPi в порядке',
    `RAM: ${formatGiB(system.memory?.availableBytes)} свободно из ${formatGiB(system.memory?.totalBytes)}; ${temperature.toFixed(1)} °C`,
    `Диски: ${diskParts.map((volume) => `${volume.name} ${volume.percent}%`).join(', ')} свободно`,
    `Сервисы: ${healthyServices}/${serviceItems.length} работают${failedServices.length ? `; проблемы: ${failedServices.join(', ')}` : ''}`,
    `Сеть: ${network.ipv4Address} → ${network.gateway}; DNS ${network.dnsUsesRouter ? 'через роутер' : 'мимо роутера'}; UFW ${network.firewallActive ? 'включён' : 'неактивен'}; Brave VPN ${vpnAvailable ? 'доступен' : 'недоступен'}`,
  ].join('\n');
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'размер неизвестен';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function formatTorrents(items) {
  if (!Array.isArray(items) || items.length === 0) return 'В qBittorrent сейчас нет задач.';
  const visible = items.slice(0, 20).map((item, index) => {
    const name = String(item.name ?? 'Без названия').replace(/\s+/g, ' ').slice(0, 120);
    const progress = Math.max(0, Math.min(100, Math.round(Number(item.progress ?? 0) * 100)));
    const state = String(item.state ?? 'unknown').slice(0, 40);
    const hash = String(item.hash ?? '').slice(0, 12);
    return `${index + 1}. ${name}\n   ${progress}% • ${formatBytes(item.size)} • ${state}${hash ? ` • ${hash}` : ''}`;
  });
  const suffix = items.length > visible.length ? `\n\nЕщё задач: ${items.length - visible.length}.` : '';
  return `qBittorrent — ${items.length} задач:\n\n${visible.join('\n\n')}${suffix}`;
}

function metadata(update) {
  const message = update.message ?? update.callback_query?.message;
  const from = update.message?.from ?? update.callback_query?.from;
  return {
    userId: from?.id,
    chatId: message?.chat?.id,
    chatType: message?.chat?.type,
    text: update.message?.text,
    callbackData: update.callback_query?.data,
  };
}

export class Jarvis {
  constructor({
    allowedUserId,
    allowedChatId = allowedUserId,
    pairingSecret,
    access,
    localLlm,
    cloudLlm,
    webResearch,
    actions,
    torrents,
    systemStatus,
    vpnGuard,
    policy = new ActionPolicy(),
  }) {
    this.allowedUserId = Number(allowedUserId);
    this.allowedChatId = Number(allowedChatId);
    this.pairingSecret = pairingSecret;
    this.access = access;
    this.localLlm = localLlm;
    this.cloudLlm = cloudLlm;
    this.webResearch = webResearch;
    this.actions = actions;
    this.torrents = torrents;
    this.systemStatus = systemStatus;
    this.vpnGuard = vpnGuard;
    this.policy = policy;
    this.pending = new Map();
    this.lastFailedPrompt = new Map();
  }

  async handle(update) {
    const meta = metadata(update);
    if (meta.userId !== this.allowedUserId || meta.chatType !== 'private' || meta.chatId !== this.allowedChatId) {
      return [];
    }

    if (meta.callbackData) return this.#handleCallback(meta);
    if (typeof meta.text !== 'string') return [];

    const text = meta.text.trim();
    if (text.startsWith('/pair ')) {
      if (!safeEqual(text.slice(6).trim(), this.pairingSecret)) {
        return [reply('Неверный код привязки.')];
      }
      this.access.pair(meta.userId);
      return [reply('Привязка выполнена. Бот принимает команды только из этого личного чата.')];
    }

    if (!this.access.isPaired(meta.userId)) {
      return [reply('Сначала выполни /pair КОД.')];
    }

    if (text === '/privacy') {
      const privacy = this.access.privacy(meta.userId);
      return [reply(
        `История: ${privacy.historyMessages} сообщений; срок ${privacy.historyTtlDays} дней; `
        + `максимум ${privacy.historyMaxMessages}. Audit: ${privacy.auditTtlDays ?? 30} дней. `
        + 'Резервные копии отключены.',
      )];
    }

    if (text === '/clear') {
      this.access.clear(meta.userId);
      try {
        await this.localLlm?.clear?.();
      } catch {
        return [reply('История SQLite очищена, но RKLLM не подтвердил сброс памяти. Повтори /clear через минуту.')];
      }
      return [reply('История диалога очищена.')];
    }

    if (text === '/start' || text === '/help') {
      return [reply(HELP_TEXT)];
    }

    if (text.startsWith('/cloud ')) {
      if (!this.cloudLlm) return [reply('Облачная модель не настроена.')];
      const prompt = text.slice(7).trim();
      if (!prompt) return [reply('Использование: /cloud вопрос')];
      return [reply(await this.cloudLlm.answer(prompt))];
    }

    if (text.startsWith('/search ')) {
      if (!this.webResearch) return [reply('Интернет-поиск не настроен.')];
      const query = text.slice(8).trim();
      if (!query) return [reply('Использование: /search запрос')];
      try {
        const result = await this.webResearch.answer(query);
        const sources = result.citations.length === 0
          ? ''
          : `\n\nИсточники:\n${result.citations.map((item, index) => `${index + 1}. ${item.title} — ${item.url}`).join('\n')}`;
        return [reply(`${result.text}${sources}`)];
      } catch (error) {
        return [reply(error.message)];
      }
    }

    if (text.startsWith('/restart ')) {
      return [this.#requestAction({ type: 'restart', service: text.slice(9).trim().toLowerCase() })];
    }

    if (text.startsWith('/torrent ')) {
      return [this.#requestAction(this.#parseTorrentCommand(text.slice(9).trim()))];
    }

    if (isCapabilityQuestion(text)) return [reply(HELP_TEXT)];

    if (isHealthQuestion(text)) {
      if (!this.systemStatus?.get
        || !this.systemStatus?.storage
        || !this.systemStatus?.services
        || !this.systemStatus?.network) {
        return [reply('Полная диагностика NanoPi не настроена.')];
      }
      try {
        const [system, storage, services, network] = await Promise.all([
          this.systemStatus.get(),
          this.systemStatus.storage(),
          this.systemStatus.services(),
          this.systemStatus.network(),
        ]);
        let vpnAvailable = false;
        try {
          vpnAvailable = await this.vpnGuard?.isAvailable() === true;
        } catch {
          vpnAvailable = false;
        }
        return [reply(formatHealth({ system, storage, services, network, vpnAvailable }))];
      } catch {
        return [reply('Не удалось собрать полный отчёт NanoPi.')];
      }
    }

    if (isTorrentInventoryQuestion(text)) {
      if (!this.torrents) return [reply('Чтение qBittorrent не настроено.')];
      try {
        return [reply(formatTorrents(await this.torrents.list()))];
      } catch {
        return [reply('Не удалось получить список qBittorrent.')];
      }
    }

    if (isSystemStatusQuestion(text)) {
      if (!this.systemStatus) return [reply('Системная диагностика не настроена.')];
      try {
        return [reply(formatSystemStatus(await this.systemStatus.get()))];
      } catch {
        return [reply('Не удалось получить состояние NanoPi.')];
      }
    }

    if (isStorageQuestion(text)) {
      if (!this.systemStatus?.storage) return [reply('Диагностика накопителей не настроена.')];
      try {
        return [reply(formatStorage(await this.systemStatus.storage()))];
      } catch {
        return [reply('Не удалось получить состояние накопителей.')];
      }
    }

    if (isServiceQuestion(text)) {
      if (!this.systemStatus?.services) return [reply('Диагностика сервисов не настроена.')];
      try {
        return [reply(formatServices(await this.systemStatus.services()))];
      } catch {
        return [reply('Не удалось получить состояние сервисов.')];
      }
    }

    if (isNetworkQuestion(text)) {
      if (!this.systemStatus?.network) return [reply('Диагностика сети не настроена.')];
      try {
        const status = await this.systemStatus.network();
        let vpnAvailable = false;
        try {
          vpnAvailable = await this.vpnGuard?.isAvailable() === true;
        } catch {
          vpnAvailable = false;
        }
        return [reply(formatNetwork(status, vpnAvailable))];
      } catch {
        return [reply('Не удалось получить состояние сети NanoPi.')];
      }
    }

    try {
      if (!this.localLlm) throw new Error('local runtime is not configured');
      return [reply(await this.localLlm.answer(text))];
    } catch {
      this.lastFailedPrompt.set(meta.userId, text);
      return [reply(
        'Локальная модель не справилась. Отправить этот запрос в облачную модель?',
        [{ text: 'Спросить облако', callbackData: 'cloud_retry' }],
      )];
    }
  }

  #requestAction(candidate) {
    try {
      const action = this.policy.validate(candidate);
      const token = crypto.randomUUID();
      this.pending.set(token, { action, stage: 1, expiresAt: Date.now() + 5 * 60_000 });
      return reply(
        `Подтверди действие: ${this.#describe(action)}`,
        [{ text: 'Подтвердить', callbackData: `confirm:${token}` }],
      );
    } catch (error) {
      if (error instanceof PolicyError) return reply(error.message);
      throw error;
    }
  }

  async #handleCallback(meta) {
    if (!this.access.isPaired(meta.userId)) return [reply('Сначала выполни /pair КОД.')];
    if (meta.callbackData === 'cloud_retry') {
      const prompt = this.lastFailedPrompt.get(meta.userId);
      if (!prompt || !this.cloudLlm) return [reply('Нет запроса для облачной модели.')];
      this.lastFailedPrompt.delete(meta.userId);
      return [reply(await this.cloudLlm.answer(prompt))];
    }
    if (!meta.callbackData.startsWith('confirm:')) return [];

    const token = meta.callbackData.slice(8);
    const pending = this.pending.get(token);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pending.delete(token);
      return [reply('Подтверждение истекло. Повтори команду.')];
    }

    if (pending.action.type === 'torrent.delete' && pending.action.deleteFiles && pending.stage === 1) {
      pending.stage = 2;
      return [reply(
        'Повторное подтверждение: будут удалены задача и скачанные файлы.',
        [{ text: 'Да, удалить файлы', callbackData: `confirm:${token}` }],
      )];
    }

    this.pending.delete(token);
    if (!this.actions) return [reply('Исполнитель действий не настроен.')];
    await this.actions.execute(pending.action);
    return [reply(`Готово: ${this.#describe(pending.action)}`)];
  }

  #parseTorrentCommand(command) {
    const [verb, ...parts] = command.split(/\s+/);
    const value = parts.join(' ');
    if (verb === 'pause') return { type: 'torrent.pause', hash: value };
    if (verb === 'resume') return { type: 'torrent.resume', hash: value };
    if (verb === 'recheck') return { type: 'torrent.recheck', hash: value };
    if (verb === 'delete') return { type: 'torrent.delete', hash: value, deleteFiles: false };
    if (verb === 'delete-files') return { type: 'torrent.delete', hash: value, deleteFiles: true };
    if (verb === 'add') return { type: 'torrent.add', magnet: value };
    if (verb === 'speed') {
      return { type: 'torrent.speed', direction: parts[0], kibPerSecond: Number(parts[1]) };
    }
    return { type: 'forbidden' };
  }

  #describe(action) {
    if (action.type === 'restart') return `restart ${action.service}`;
    if (action.type === 'torrent.delete') {
      return `${action.deleteFiles ? 'удалить торрент и файлы' : 'удалить задачу'} ${action.hash}`;
    }
    return action.type.replace('torrent.', '');
  }
}
