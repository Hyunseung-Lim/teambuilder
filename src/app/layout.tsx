import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthContext from "./context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <AuthContext>{children}</AuthContext>
      </body>
    </html>
  );
}
