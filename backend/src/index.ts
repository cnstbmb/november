import { Server } from './server/server';
import { makeLogger } from './logger/logger-factory';

const logger = makeLogger();
const server = new Server(logger);

server.registerRoutes();
server.start();
