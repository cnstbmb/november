import fs from 'fs';

export function loadConfigByPath<Config>(path: string): Config | null {
    if (!fs.existsSync(path)) {
        return null;
    }

    const fileBuffer = fs.readFileSync(path);
    return JSON.parse(fileBuffer.toString());
}
