import path from 'path';
import prompt from 'prompt';
import { makeLogger } from '../logger/logger-factory';
import { BCryptConfig } from '../auth/types';
import { loadConfigByPath } from '../utils/config-loader';
import { Cryptographer } from '../auth/cryptographer';
import { PgConfigs } from '../types/pg-configs';
import { UsersStorage } from '../storages/users/storage';
import { UsersController } from '../controllers/users/controller';
import { PgClient } from '../db/client';
import { currentEnv } from '../env';

const logger = makeLogger();

const dbConfigPath = path.join(__dirname, '..', 'configs', 'database.json');
const dbConfigs: PgConfigs | null = loadConfigByPath<PgConfigs>(dbConfigPath);

if (!dbConfigs) {
    throw new Error(`no config at path "${dbConfigPath}"`);
}

const bcryptConfigPath = path.join(__dirname, '..', 'configs', 'bcrypt.config.json');
const bcryptConfig: BCryptConfig | null = loadConfigByPath<BCryptConfig>(bcryptConfigPath);

if (!bcryptConfig) {
    throw new Error(`no config at path "${bcryptConfigPath}"`);
}

const dbConfig = dbConfigs[currentEnv()];

const cryptographer = new Cryptographer(bcryptConfig);
const dbClient = new PgClient(logger, dbConfig);
const usersStorage = new UsersStorage(logger, dbClient);
const usersController = new UsersController(logger, usersStorage, cryptographer);

(async () => {
    prompt.start();

    const { login, password } = await prompt.get(['login', 'password']);
    await usersController.createUser(login as string, password as string);
    process.exit();
})();
