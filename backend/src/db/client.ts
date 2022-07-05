import { QueryResult, Pool } from 'pg';
import * as util from 'util';
import { ILogger } from '../logger/types';
import { getRandomShortHexId } from '../utils/random';
import { PgAdapter, PgAdapterConfig, PgResult } from './types';

export class PgClient implements PgAdapter {
    private readonly pool: Pool;

    private log = true;

    public set logSql(flag: boolean) {
        this.logger.info('Setting log sql: "%s"', flag);
        this.log = flag;
    }

    constructor(private readonly logger: ILogger, private readonly config: PgAdapterConfig) {
        if (!this.logger) {
            throw new Error('Invalid logger for PgClient');
        }

        if (!this.config) {
            this.logger.error('Config loading error: \'%j\'', this.config);
            throw new Error('Invalid pg adapter config');
        }

        this.pool = new Pool(this.config);

        const sanitized = {
            ...this.config,
            password: this.config.password ? '********' : undefined,
        };
        logger.info('Initialized PgClient with: \'%j\'', sanitized);
    }

    async query<Result>(query: string, params: string[] = []): Promise<PgResult<Result>> {
        const queryId = getRandomShortHexId();

        if (this.log) {
            this.logger.info(`[DB] request: "${query}", with params "%s"`, params);
            const jsonParams = params ? JSON.stringify(params) : '';
            this.logger.info({ qid: queryId }, util.format(
                '[PgAdapter.query] sql: \'%s\', params: \'%s\'',
                this.queryForLog(query, this.config.maxSqlLogLength),
                this.queryForLog(jsonParams, this.config.maxParamsLogLength),
            ));
        }

        let pgResult: PgResult<Result> = { rows: [], rowCount: 0 };
        let queryDuration = 0;

        try {
            let result: QueryResult;
            const queryStart = new Date();

            if (this.pool.idleCount === 0
                && this.config.max && this.pool.totalCount >= this.config.max) {
                this.logger.warn('There is probably a lack of connections %s/%s',
                    this.pool.totalCount,
                    this.config.max);
            }

            if (params) {
                result = await this.pool.query(query, params);
            } else {
                result = await this.pool.query(query);
            }

            queryDuration = new Date().getTime() - queryStart.getTime();
            pgResult = {
                rows: result.rows,
                rowCount: result.rows?.length || 0,
            };
        } catch (err) {
            this.logger.error(err);
            throw err;
        }

        if (this.logSql) {
            this.logger.info({
                qid: queryId,
                duration: queryDuration,
                rNums: pgResult.rowCount,
            },
            `[PgAdapter.query] done in ${queryDuration} ms.`);
        }

        return pgResult;
    }

    private queryForLog(sql: string, maxLength: number): string {
        return sql.slice(0, maxLength);
    }
}
