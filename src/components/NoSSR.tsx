'use client';

import { ReactNode, useEffect, useState } from 'react';

interface NoSSRProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * NoSSR 컴포넌트 - 클라이언트에서만 렌더링되는 컴포넌트
 * Grammarly 등의 브라우저 확장으로 인한 hydration 에러를 방지
 */
export default function NoSSR({ children, fallback = null }: NoSSRProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}