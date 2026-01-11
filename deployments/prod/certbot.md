sudo apt-get update
sudo apt-get install -y certbot
sudo apt-get install -y python3-certbot-nginx

sudo certbot --nginx -d k.himenkov.ru -d k.himenkov.ru

systemctl list-timers | grep certbot
sudo certbot renew --dry-run

sudo install -d /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload_nginx.sh >/dev/null <<'SH'
#!/usr/bin/env bash
nginx -t && systemctl reload nginx || true
SH
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload_nginx.sh

__________
ssl_certificate     /etc/letsencrypt/live/k.himenkov.ru/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/k.himenkov.ru/privkey.pem;



curl -X PATCH "https://api.cloudflare.com/client/v4/zones/c87a0cbb328ac20260fbae7e180e6659/settings/ech" \
-H "Authorization: Bearer woeJUr8zTvFfJJdH0bZULzucTYtF6qZIKxPYamID" \
-H "Content-Type:application/json" --data '{"id":"ech","value":"off"}'
