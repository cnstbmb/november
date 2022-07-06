# november

Generation ssl:
 - `ssh-keygen -t rsa -b 4096 -E SHA512 -f %NAME%.key`


 - `openssl genrsa -out %NAME_PRIVATE%.pem 4096`
 - `openssl rsa -pubout -in %NAME_PRIVATE%.pem -out %NAME_PUBLIC%.pem`
 - не забудь при запуске докер образа монтировать каталог с конфигами


Migraions: 
 - `npm run migration:create:db -- %DB_NAME%` - создание БД
 - `npm run migration:create:table -- %TABLE_NAME%` - Создание таблицы