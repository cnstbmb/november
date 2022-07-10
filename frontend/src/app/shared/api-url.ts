import { environment } from '../../environments/environment';

export function apiUrl(urlPath: string): string {
  return environment.apiUrl + urlPath;
}
