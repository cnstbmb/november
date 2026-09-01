import { Bot } from "grammy";
import { SocksProxyAgent } from "socks-proxy-agent";

export function telegramFetchConfig(
  proxyUrl: string,
): Record<string, unknown> | undefined {
  if (!proxyUrl) return undefined;
  return {
    agent: new SocksProxyAgent(proxyUrl),
    compress: true,
  };
}

export function createTelegramBot(token: string, proxyUrl: string): Bot {
  const baseFetchConfig = telegramFetchConfig(proxyUrl);
  return new Bot(
    token,
    baseFetchConfig
      ? {
          client: {
            baseFetchConfig,
          },
        }
      : undefined,
  );
}
