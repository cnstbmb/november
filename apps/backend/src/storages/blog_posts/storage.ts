import { PgClient } from '../../db/client';
import { QueryParams } from '../../db/types';
import { ILogger } from '../../logger/types';
import { BlogPost, BlogPostFilters } from './types';

// TODO: knex
export class BlogStorage {
    private readonly tableName = 'blog_posts';

    constructor(
        private readonly logger: ILogger,
        private readonly client: PgClient
    ) {}

    async createBlogPost(
        author: string,
        title: string,
        content: string,
        hashtags: string[] = []
    ): Promise<string> {
        this.loggerInfo('creating blog post');
        const now = new Date();

        const query = `INSERT INTO ${this.tableName}
     (
        created,
        updated,
        title,
        content,
        author,
        hashtags
    ) VALUES (
        $1,
        $1,
        $2,
        $3,
        $4,
        $5
    ) RETURNING id;`;

        const result = await this.client.query<{ id: string }>(
            query,
            [now, title, content, author, hashtags]
        );

        return result.rows[0].id;
    }

    async selectPosts(
        filters: BlogPostFilters,
        limit?: number,
        offset?: number
    ): Promise<BlogPost[]> {
        this.loggerInfo('select blog posts by filter %j', filters);

        let query = `SELECT * FROM ${this.tableName} WHERE deleted = FALSE`;

        const filterResult = this.buildFilterSubquery<BlogPostFilters>(filters);
        const { subquery: filterSubQuery, params: queryParams } = filterResult;

        if (filterSubQuery) {
            query += ` AND ${filterSubQuery}`;
        }

        query += ' ORDER BY created DESC';

        if (limit !== undefined) {
            queryParams.push(limit);
            const limitQueryParamsPosition = queryParams.length;
            query += ` LIMIT $${limitQueryParamsPosition}`;
        }

        if (offset !== undefined) {
            queryParams.push(offset);
            const offsetQueryParamsPosition = queryParams.length;
            query += ` OFFSET $${offsetQueryParamsPosition}`;
        }

        return (await this.client.query<BlogPost>(query, queryParams)).rows;
    }

    async deletePost(id: string): Promise<string> {
        this.loggerInfo(`Set deleted for post "${id}"`);
        const now = new Date();
        const query = `UPDATE ${this.tableName} SET deleted = TRUE, updated = $1 WHERE id = $2 RETURNING id;`;
        return (await this.client.query<{ id: string }>(query, [now, id])).rows[0].id;
    }

    private buildFilterSubquery<T = Record<string, QueryParams>>(
        filters: T
    ): { subquery: string; params: QueryParams[] } {
        const entries = Object.entries(filters);
        if (!entries.length) {
            return { subquery: '', params: [] };
        }

        const queryParams: QueryParams[] = [];
        const queryFilters = entries.map(([key, value], index) => {
            queryParams.push(value as QueryParams);
            return `${key} = $${index + 1}`;
        });

        return { subquery: queryFilters.join(' AND '), params: queryParams };
    }

    private loggerInfo(...message: (string | unknown)[]): void {
        const prefix = '[BlogPostsStorage]';
        this.logger.info(`${prefix} `, message);
    }
}
