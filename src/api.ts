import type { Analysis, DemoScenario, Documents, Health } from './types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(100_000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The local review server did not return a valid response. Check that it is running.'); }
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status}).`);
  return data as T;
}
export const getHealth = () => request<Health>('/api/health');
export const getDemo = () => request<Documents>('/api/demo');
export const getDemos = () => request<DemoScenario[]>('/api/demos');
export const analyze = (documents: Documents, mode: 'rules' | 'nebius') => request<Analysis>('/api/analyze', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scope: documents.scope, quote: documents.quote, mode }),
});
