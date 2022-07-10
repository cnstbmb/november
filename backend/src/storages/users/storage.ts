import { ILogger } from '../../logger/types';
import { PgClient } from '../../db/client';
import { User } from './types';

export class UsersStorage {
    private readonly tableName = 'users';

    private readonly loggerPrefix = '[UserStorage]';

    constructor(private readonly logger: ILogger, private readonly client: PgClient) {
    }

    async createUser(login: string, password: string): Promise<User | undefined> {
        this.logger.info(`${this.loggerPrefix} creating user`);
        const now = new Date();
        const query = `INSERT into ${this.tableName} (login, password, created, updated) VALUES ($1, $2, $3, $3) ON CONFLICT (login) DO NOTHING RETURNING *`;
        const result = await this.client.query<User>(query, [login, password, now]);

        return result.rows[0];
    }

    async getUserByLogin(login: string): Promise<User | undefined> {
        this.logger.info(`${this.loggerPrefix} user "${login}" searching`);

        const query = `SELECT * FROM  ${this.tableName} WHERE login=$1`;

        const result = await this.client.query<User>(query, [login]);

        return result.rows[0];
    }
}
