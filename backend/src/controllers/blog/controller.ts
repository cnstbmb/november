import { ILogger } from "../../logger/types";
import { BlogStorage } from "../../storages/blog_posts/storage";

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
}
