type UUID = string;

export interface PostCreatedResponse {
  id: UUID;
}

export interface BlogPostData {
  content: string;
  title: string;
  hashtags: string[];
}

export interface BlogPostFullData extends BlogPostData {
  author: string;
  created: Date;
  id: UUID;
  updated: Date;
}

// TODO: не плодить дубли, продумать в сторону общих интерфейсов.
export interface BlogPost {
  id: UUID;
  created: Date;
  updated: Date;
  title: string;
  hashtags: string[];
  content: string;
  author: string;
}
