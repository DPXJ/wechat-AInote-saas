import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "微信资料台",
  description: "把微信里的资料手动收录、搜索、预览，并同步到 Notion 或滴答清单。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
