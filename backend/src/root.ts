import express from 'express';
import path from 'path';
import { ILogger } from './logger/types';
import { makeLogger } from './logger/logger-factory';
import { PgConfigs } from './types/pg-configs';
import { loadConfigByPath } from './utils/config-loader';
import { BCryptConfig } from './auth/types';
import { Cryptographer } from './auth/cryptographer';
import { currentEnv } from './env';
import { PgClient } from './db/client';
import { UsersStorage } from './storages/users/storage';
import { UsersController } from './controllers/users/controller';
import { Routes } from './routes/routes';
import { Server } from './server/server';

interface Root {
    logger: ILogger;
    application: express.Express;
    cryptographer: Cryptographer;
    dbClient: PgClient;
    usersStorage: UsersStorage;
    usersController: UsersController;
    routes: Routes,
    server: Server,
}

export function compose(): Root {
    const dbConfigPath = path.join(__dirname, 'configs', 'database.json');
    const dbConfigs: PgConfigs | null = loadConfigByPath<PgConfigs>(dbConfigPath);

    if (!dbConfigs) {
        throw new Error(`no config at path "${dbConfigPath}"`);
    }

    const bcryptConfigPath = path.join(__dirname, 'configs', 'bcrypt.config.json');
    const bcryptConfig: BCryptConfig | null = loadConfigByPath<BCryptConfig>(bcryptConfigPath);

    if (!bcryptConfig) {
        throw new Error(`no config at path "${bcryptConfigPath}"`);
    }

    const dbConfig = dbConfigs[currentEnv()];

    const application = express();
    const logger = makeLogger();
    const cryptographer = new Cryptographer(bcryptConfig);
    const dbClient = new PgClient(logger, dbConfig);
    const usersStorage = new UsersStorage(logger, dbClient);
    const usersController = new UsersController(logger, usersStorage, cryptographer);
    const routes = new Routes(logger, application);
    const server = new Server(logger, routes, application);

    return {
        application,
        logger,
        cryptographer,
        dbClient,
        usersStorage,
        usersController,
        routes,
        server,
    };
}
