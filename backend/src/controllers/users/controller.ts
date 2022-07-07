import { ILogger } from '../../logger/types';
import { UsersStorage } from '../../storages/users/storage';
import { Cryptographer } from '../../auth/cryptographer';
import { User } from '../../storages/users/types';

export class UsersController {
    private readonly loggerPrefix = '[User controller]'

    constructor(
        private readonly logger: ILogger,
        private readonly storage: UsersStorage,
        private readonly crypto: Cryptographer,
    ) {
    }

    async createUser(login: string, password: string): Promise<User | null> {
        this.logger.info(`${this.loggerPrefix} Try to create user`);

        const encryptedPassword = await this.crypto.bcryptString(password);

        const createdUser = await this.storage.createUser(login, encryptedPassword);

        if (!createdUser) {
            this.logger.info(`${this.loggerPrefix} user "${login}" not created`);
            return null;
        }

        this.logger.info(`${this.loggerPrefix} user "${createdUser.login}" created. id "${createdUser.id}"`);

        return createdUser;
    }

    async deleteUser(): Promise<unknown> {
        throw new Error('Method deleteUser not implemented');
    }

    async updateUser(): Promise<unknown> {
        throw new Error('Method updateUser not implemented');
    }

    async isCorrectLoginPassword(login: string, password: string): Promise<boolean> {
        this.logger.info(`${this.loggerPrefix} Start validating login password`);
        const user = await this.storage.getUserByLogin(login);

        if (!user) {
            return false;
        }

        const { password: encryptedPassword } = user;

        return this.crypto.compareBcryptString(password, encryptedPassword);
    }
}
