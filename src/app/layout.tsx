import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import AuthContext from "./context/AuthContext";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 팀 빌더",
  description: "AI 에이전트로 팀을 구성하는 애플리케이션",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="antialiased">
      <body className={notoSansKR.className} suppressHydrationWarning={true}>
        <AuthContext>{children}</AuthContext>
      </body>
    </html>
  );
}
