import { apiRequest as request } from '@danbro96/lupira-http/transport';

export function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  return request<T>(url, init);
}
