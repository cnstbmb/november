import { UUID } from '../../types/uuid';

export interface User {
    id: UUID;
    created: Date;
    updated: Date;
    login: string;
    password: string;
}
