import * as crypto from 'crypto';

export function getRandomInt(min: number, max: number, randomNum?: number): number {
    const randomNumber = randomNum || Math.random();

    return Math.floor(randomNumber * (max - min + 1)) + min;
}

export function getRandomShortHexId(): string {
    return getRandomInt(1, 0x7FFFFFFF).toString(16);
}

export function getRandomString(length: number = 16): string {
    const buf = crypto.randomBytes(length);
    return buf.toString('hex');
}
