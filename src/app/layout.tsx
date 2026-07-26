import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 信迹",
  description: "把资料手动收录、搜索、预览，沉淀文件时间线，并同步到外部工具。",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI 信迹",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
