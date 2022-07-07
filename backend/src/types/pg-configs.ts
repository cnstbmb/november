import { PgAdapterConfig } from '../db/types';

export interface PgConfigs {
    [env: string]: PgAdapterConfig
}
