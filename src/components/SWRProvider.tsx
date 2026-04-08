'use client';

import { SWRConfig } from 'swr';

const fetcher = (url: string): Promise<unknown> =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  });

export function SWRProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SWRConfig value={{ fetcher }}>{children}</SWRConfig>;
}
