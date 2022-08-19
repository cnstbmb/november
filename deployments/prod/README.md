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