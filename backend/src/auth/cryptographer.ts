import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { BCryptConfig } from './types';

export class Cryptographer {
    private readonly rsaPrivateKeyPath = path.join(__dirname, '..', 'configs', 'crypto-pass.pem');

    private readonly rsaPublicKeyPath = path.join(__dirname, '..', 'configs', 'crypto-pass-public.pem');

    private readonly rsaPrivateKey: Buffer;

    private readonly rsaPublicKey: Buffer;

    private readonly saltRound: number;

    constructor(bcryptConfig: BCryptConfig) {
        this.rsaPrivateKey = fs.readFileSync(this.rsaPrivateKeyPath);
        this.rsaPublicKey = fs.readFileSync(this.rsaPublicKeyPath);
        this.saltRound = bcryptConfig.round;
    }

    async bcryptString(value: string): Promise<string> {
        return bcrypt.hash(value, this.saltRound);
    }

    async compareBcryptString(value: string, encryptedValue: string): Promise<boolean> {
        return bcrypt.compare(value, encryptedValue);
    }

    encryptString(data: string): string {
        const stringBuffer = Buffer.from(data);
        const encryptedStringBuffer = crypto.publicEncrypt(this.rsaPublicKey, stringBuffer);
        return encryptedStringBuffer.toString('base64');
    }

    decryptString(encryptedString: string): string {
        const encryptedStringBuffer = Buffer.from(encryptedString, 'base64');
        const decryptedStringBuffer = crypto.privateDecrypt(
            this.rsaPrivateKey,
            encryptedStringBuffer,
        );

        return decryptedStringBuffer.toString('utf-8');
    }
}
