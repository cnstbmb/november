let dbm = require('db-migrate');

let type = dbm.dataType;

let seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function (options, seedLink) {
    dbm = options.dbmigrate;
    type = dbm.dataType;
    seed = seedLink;
};

const tableName = 'blog_posts';

exports.up = (db) => db.createTable(tableName, {
    id: {
        type: type.STRING,
        primaryKey: true,
        // eslint-disable-next-line no-new-wrappers
        defaultValue: new String('uuid_generate_v4()'),
    },
    created: { type: type.DATE_TIME },
    updated: { type: type.DATE_TIME },
    title: {type: type.STRING},
    hashtags: {type: 'text[]'},
    content: {type: type.TEXT},
    author: {type: type.STRING},
});

exports.down = (db) => db.dropTable(tableName);

exports._meta = {
    version: 1,
};
