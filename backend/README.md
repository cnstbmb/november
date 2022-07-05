# november

Generation ssl:
 - `ssh-keygen -t rsa -b 4096 -E SHA512 -f private.key`
 - не забудь при запуске докер образа монтировать каталог с конфигами


Migraions: 
 - `npm run migration:create:db -- %DB_NAME%` - создание БД
 - `npm run migration:create:table -- %TABLE_NAME%` - Создание таблицы