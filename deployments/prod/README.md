Копировать содержимое каталога на удалённый сервер, для разврёртывания.

После копирования содержимого, выполнить команду

`sudo crontab -e`

Добавить к открывшемся файле

`@reboot /srv/run_server.sh`

`@monthly /srv/ssl_renew.sh >> /var/log/cron.log 2>&1`

Копировать необходимые файлы с конфигами для подключения к БД + ключию


Добавление нового юзера

`docker run -v=/srv/configs:/home/app/server/configs -it cnstbmb/khimenkov-nodejs-server:latest /bin/sh` 
`NODE_ENV=dev ./add-user.sh`

________
TODO: скрипт инициализации сделать надо 
sudo mkdir -p   /srv/pg-data   /srv/postgres/init   /srv/configs   /srv/logs   /srv/views   /srv/dhparam   /srv/certbot/etc   /srv/certbot/var

sudo chown -R cnstbmb:cnstbmb /srv

chmod u+x run_server.sh && chmod u+x ssl_renew.sh

Выпуск сертификата `docker run --rm -p 80:80   -v /srv/certbot/etc:/etc/letsencrypt   -v /srv/certbot/var:/var/lib/letsencrypt   certbot/certbot certonly --standalone   -d konstantin.himenkov.ru   --email cnstbmb@gmail.com --agree-tos --no-eff-email -v`
