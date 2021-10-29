import {Server} from './server'
import{makeLogger} from './logger/logger-factory'

const logger = makeLogger();
const server = new Server(logger);

server.start();
server.registerRoutes();