# Keep the MVP control plane private

The MVP exposes its control API only on loopback or the private Compose network, with a minimal non-diagnostic liveness endpoint as the sole candidate for external publication. Telegram and local CLI commands are the supported control surfaces until a separately authenticated admin interface is designed, avoiding a prematurely public administrative API.
