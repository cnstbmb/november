// Production overrides this file through Ansible. Analytics stays fail-open and
// disabled in local, preview, and test builds unless explicitly configured.
window.__TONEM_ANALYTICS__ = { enabled: false };
