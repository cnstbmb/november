import { PgClient } from "../../db/client";
import { QueryParams } from "../../db/types";
import { ILogger } from "../../logger/types";
import { BlogPost, BlogPostFilters } from "./types";

export class BlogStorage {
  private readonly tableName = "blog_posts";

  private readonly loggerPrefix = "[BlogPostsStorage]";

  constructor(
    private readonly logger: ILogger,
    private readonly client: PgClient
  ) {}

  async createBlogPost( author: string, title: string, content: string, hashtags: string[] = []): Promise<string> {
    this.logger.info(`${this.loggerPrefix} creating blog post`);
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

    const result = await this.client.query<{id: string}>(query, [now, title, content, author, hashtags]);

    return result.rows[0].id;
  }

  async selectPosts(filters: BlogPostFilters, limit?: number, offset?: number): Promise<BlogPost[]> {
    this.logger.info(`${this.loggerPrefix} select blog posts by filter %j`, filters);

    let query = `SELECT * FROM ${this.tableName}`;

    const {subquery: filterSubQuery, params: queryParams} = this.buildFilterSubquery<BlogPostFilters>(filters);

    if (filterSubQuery) {
        query += ` WHERE ${filterSubQuery}`;
    }

    if (limit) {
        queryParams.push(limit);
        const limitQueryParamsPosition = queryParams.length + 1;
        query += ` LIMIT $${limitQueryParamsPosition}`
    }

    if (offset) {
        queryParams.push(offset);
        const offsetQueryParamsPosition = queryParams.length + 1;
        query += ` OFFSET $${offsetQueryParamsPosition}`
    }

    return (await (this.client.query<BlogPost>(query, queryParams))).rows;
  }

  private buildFilterSubquery<T=unknown>(filters: T): {subquery: string, params: QueryParams[]} {
    if (!Object.keys.length) {
        return {subquery: '', params: []};
    }
    let queryParamsLength = 0;
    const queryParams: QueryParams[] = [];
    const queryFilters: string[] = [];

    for (const [key, value] of Object.entries(filters)) {
        queryParamsLength++;
        queryParams.push(value);
        queryFilters.push(`${key} = $${queryParamsLength}`);
    }

    return {subquery: queryFilters.join(' AND '), params: queryParams};
  } 
}
