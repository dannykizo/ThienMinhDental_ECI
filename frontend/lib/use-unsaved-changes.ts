'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import type { ActionDialogOptions } from '@/components/use-action-dialog';

type RequestAction = (options: ActionDialogOptions) => Promise<string | null>;

const discardDialog: ActionDialogOptions = {
  title: 'Bỏ thay đổi chưa lưu?',
  description: 'Thông tin bạn vừa nhập chưa được lưu. Nếu tiếp tục, các thay đổi này sẽ bị mất.',
  confirmLabel: 'Bỏ thay đổi',
  danger: true,
};

export function useUnsavedChanges(isDirty: boolean, requestAction: RequestAction) {
  const router = useRouter();

  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const interceptNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      void requestAction(discardDialog).then((result) => {
        if (result !== null) router.push(`${destination.pathname}${destination.search}${destination.hash}`);
      });
    };
    document.addEventListener('click', interceptNavigation, true);
    return () => document.removeEventListener('click', interceptNavigation, true);
  }, [isDirty, requestAction, router]);

  return useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    return (await requestAction(discardDialog)) !== null;
  }, [isDirty, requestAction]);
}
