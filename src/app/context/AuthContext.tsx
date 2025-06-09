"use client";

import { SessionProvider } from "next-auth/react";

type Props = {
  children: React.ReactNode;
};

export default function AuthContext({ children }: Props) {
  //공식 사이트의 session Props는 옵셔널
  return <SessionProvider>{children}</SessionProvider>;
}
