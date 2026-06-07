import { PoolConfig } from 'pg';

export interface PgResult<Response> {
    rows: Response[];
    rowCount: number;
}

export interface PgAdapter {
    query<Response>(query: string,
        params?: QueryParams[]
    ): Promise<PgResult<Response>>;
}

export interface PgAdapterConfig extends PoolConfig {
    maxSqlLogLength: number;
    maxParamsLogLength: number;
}

export interface PoolStats {
    total: number,
    idle: number,
    waiting: number
}

export type QueryParams = string | number | Date | string[] | number[] | Date[];
