function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function certificate(domain) {
  return {
    usage: "encipherment",
    keyFile: `/etc/letsencrypt/live/${domain}/privkey.pem`,
    certificateFile: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
  };
}

export function profileWithTonemTransportDomains(
  profileConfig,
  {
    domain = "live.tonem.ru",
    legacyDomain = "moscow.himenkov.ru",
    hysteriaTag = "HYSTERIA2_MOSCOW",
    reserveTag = "VLESS_REALITY_HOME_WIFI",
  } = {},
) {
  const profile = structuredClone(profileConfig);
  const hysteria = (profile.inbounds ?? []).find((item) => item.tag === hysteriaTag);
  const reserve = (profile.inbounds ?? []).find((item) => item.tag === reserveTag);
  assert(hysteria, `${hysteriaTag} inbound is missing`);
  assert(reserve, `${reserveTag} inbound is missing`);

  const tls = hysteria.streamSettings?.tlsSettings;
  assert(tls, `${hysteriaTag} has no tlsSettings`);
  tls.serverName = domain;
  const retainedCertificates = (tls.certificates ?? []).filter((item) => {
    const file = String(item.certificateFile ?? "");
    return !file.includes(`/live/${domain}/`) && !file.includes(`/live/${legacyDomain}/`);
  });
  tls.certificates = [certificate(domain), certificate(legacyDomain), ...retainedCertificates];

  const masquerade = hysteria.streamSettings?.hysteriaSettings?.masquerade;
  assert(masquerade, `${hysteriaTag} has no masquerade settings`);
  masquerade.url = `https://${domain}/`;

  const reality = reserve.streamSettings?.realitySettings;
  assert(reality, `${reserveTag} has no realitySettings`);
  reality.serverNames = unique([domain, legacyDomain, ...(reality.serverNames ?? [])]);

  return profile;
}

export function transportDomainDrift(profileConfig, options) {
  const desired = profileWithTonemTransportDomains(profileConfig, options);
  return JSON.stringify(desired) !== JSON.stringify(profileConfig);
}

export function profileWithoutLegacyTransportDomains(
  profileConfig,
  {
    domain = "live.tonem.ru",
    legacyDomain = "moscow.himenkov.ru",
    hysteriaTag = "HYSTERIA2_MOSCOW",
    reserveTag = "VLESS_REALITY_HOME_WIFI",
  } = {},
) {
  const profile = profileWithTonemTransportDomains(profileConfig, {
    domain,
    legacyDomain,
    hysteriaTag,
    reserveTag,
  });
  const hysteria = profile.inbounds.find((item) => item.tag === hysteriaTag);
  const reserve = profile.inbounds.find((item) => item.tag === reserveTag);
  hysteria.streamSettings.tlsSettings.certificates = (
    hysteria.streamSettings.tlsSettings.certificates ?? []
  ).filter(
    (item) => !String(item.certificateFile ?? "").includes(`/live/${legacyDomain}/`),
  );
  reserve.streamSettings.realitySettings.serverNames = (
    reserve.streamSettings.realitySettings.serverNames ?? []
  ).filter((value) => value !== legacyDomain);
  return profile;
}

export function transportLegacyRetirementDrift(profileConfig, options) {
  const desired = profileWithoutLegacyTransportDomains(profileConfig, options);
  return JSON.stringify(desired) !== JSON.stringify(profileConfig);
}
