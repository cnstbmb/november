import express from 'express';
import path from 'path';
import { Server } from './server/server';
import { makeLogger } from './logger/logger-factory';
import { Routes } from './routes/routes';
import { PgClient } from './db/client';
import { loadConfigByPath } from './utils/config-loader';
import { PgAdapterConfig } from './db/types';
import { currentEnv } from './env';

interface PgConfigs {
    [env: string]: PgAdapterConfig
}

const application: express.Express = express();

const logger = makeLogger();

const dbConfigPath = path.join(__dirname, 'configs', 'database.json');
const dbConfigs: PgConfigs | null = loadConfigByPath<PgConfigs>(dbConfigPath);

if (!dbConfigs) {
    throw new Error(`no config at path "${dbConfigPath}"`);
}

const dbConfig = dbConfigs[currentEnv()];
const dbClient = new PgClient(logger, dbConfig);
const routes = new Routes(logger, application);
const server = new Server(logger, routes, application);

server.registerRoutes();
server.start();

process.on('uncaughtException', (err) => {
    logger.info('\n--------- SERVER UNCAUGHT EXCEPTION ---------\n');
    logger.error(err);
    logger.info('\n---------------------------------------------\n');
});
