import express from 'express';
import { Server } from './server/server';
import { makeLogger } from './logger/logger-factory';
import { Routes } from './routes/routes';

const application: express.Express = express();

const logger = makeLogger();

const routes = new Routes(logger, application);
const server = new Server(logger, routes, application);

server.registerRoutes();
server.start();

process.on('uncaughtException', (err) => {
    logger.info('\n--------- SERVER UNCAUGHT EXCEPTION ---------\n');
    logger.error(err);
    logger.info('\n---------------------------------------------\n');
});
