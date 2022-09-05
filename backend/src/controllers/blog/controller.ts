import { ILogger } from "../../logger/types";
import { BlogStorage } from "../../storages/blog_posts/storage";
import { BlogPost } from "../../storages/blog_posts/types";

export class BlogController {
  constructor(private logger: ILogger, private storage: BlogStorage) {}

  async savePost(
    author: string,
    title: string,
    content: string,
    hashtags = []
  ): Promise<string> {
    this.loggerInfo(` creating blog post`);
    const id = await this.storage.createBlogPost(
      author,
      title,
      content,
      hashtags
    );

    this.loggerInfo(` post created with id="${id}"`);
    return id;
  }

  async getPosts(limit?: number, offset?: number): Promise<BlogPost[]> {
    this.loggerInfo(`get posts limit ${limit}; offset ${offset}`);
    return this.storage.selectPosts({}, limit, offset);
  }

  async deletePost(postId: string): Promise<string> {
    this.loggerInfo(`mark post "${postId}" to delete`);

    return this.storage.deletePost(postId);
  }

  private loggerInfo(message: string): void {
    const prefix = "[BlogPostsStorageController]";
    this.logger.info(`${prefix} ${message}`);
  }
}
