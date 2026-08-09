import { useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { TokenExpiredError } from '@/utils/api';

export function useApiWithAuth<T extends (...args: any[]) => Promise<any>>(apiFn: T) {
  return useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      try {
        // @ts-ignore
        return await apiFn(...args);
      } catch (error) {
        if (error instanceof TokenExpiredError) {
          await signOut({ callbackUrl: '/signin' });
          return Promise.reject(error);
        }
        throw error;
      }
    },
    [apiFn],
  );
}
