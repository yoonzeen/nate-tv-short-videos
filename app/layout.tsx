import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "NATE News Shorts",
  description: "세상의 속도, 네이트 뉴스",
  icons: {
    icon:
      process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH.length > 0
        ? `${process.env.NEXT_PUBLIC_BASE_PATH}/favicon.ico`
        : "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link
          rel="icon"
          href={`${basePath}/favicon.ico`}
          sizes="any"
        />
        <link
          rel="icon"
          href={`${basePath}/favicon.png`}
          type="image/png"
        />
        <link
          rel="apple-touch-icon"
          href={`${basePath}/favicon.png`}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
