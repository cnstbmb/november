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
const columnName = 'deleted';

exports.up = (db) => db.addColumn(tableName, columnName, {type: type.BOOLEAN, defaultValue: false});

exports.down = (db) => db.removeColumn(tableName, columnName);

exports._meta = {
    version: 1,
};
