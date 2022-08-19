import { UUID } from "../../types/uuid";

export interface BlogPost {
    id: UUID;
    created: Date;
    updated: Date;
    title: string;
    hashtags: string[];
    content: string;
    author: string;
  };

export interface BlogPostFilters {
  title?: string;
  hashtags?: string[];
  author?: string;
}