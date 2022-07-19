import { compose } from './root';

const { server, logger } = compose();

server.registerRoutes();
server.start();

process.on('uncaughtException', (err) => {
    logger.info('\n--------- SERVER UNCAUGHT EXCEPTION ---------\n');
    logger.error(err);
    logger.info('\n---------------------------------------------\n');
});
