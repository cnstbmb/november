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

const tableName = 'users';
const columnLogin = 'login';
const columnPassword = 'password';
const columnCreated = 'created';
const columnUpdated = 'updated';

exports.up = async (db) => {
    await db.changeColumn(tableName, columnLogin, {
        type: type.STRING,
        notNull: true,
        unique: true,
    });
    await db.changeColumn(tableName, columnPassword, {
        type: type.STRING,
        notNull: true,
    });
    await db.changeColumn(tableName, columnCreated, {
        type: type.DATE_TIME,
        notNull: true,
    });
    await db.changeColumn(tableName, columnUpdated, {
        type: type.DATE_TIME,
        notNull: true,
    });
};

exports.down = async (db) => {
    await db.changeColumn(tableName, columnLogin, {
        type: type.STRING,
        notNull: false,
        unique: false,
    });
    await db.changeColumn(tableName, columnPassword, {
        type: type.STRING,
        notNull: false,
    });
    await db.changeColumn(tableName, columnCreated, {
        type: type.DATE_TIME,
        notNull: false,
    });
    await db.changeColumn(tableName, columnUpdated, {
        type: type.DATE_TIME,
        notNull: false,
    });
};

exports._meta = {
    version: 1,
};
