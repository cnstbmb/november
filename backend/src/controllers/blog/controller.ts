import { ILogger } from "../../logger/types";
import { BlogStorage } from "../../storages/blog_posts/storage";
import { BlogPost } from "../../storages/blog_posts/types";

export class BlogController {
  private readonly loggerPrefix = "[BlogPostsStorage]";

  constructor(private logger: ILogger, private storage: BlogStorage) {}

  async savePost(
    author: string,
    title: string,
    content: string,
    hashtags = []
  ): Promise<string> {
    this.logger.info(`${this.loggerPrefix} creating blog post`);
    const id = await this.storage.createBlogPost(
      author,
      title,
      content,
      hashtags
    );

    this.logger.info(`${this.loggerPrefix} post created with id="${id}"`);
    return id;
  }

  async getPosts(limit?: number, offset?: number): Promise<BlogPost[]> {
    this.logger.info(`${this.loggerPrefix} get posts limit ${limit}; offset ${offset}`);
    return this.storage.selectPosts({}, limit, offset);
  }
}
