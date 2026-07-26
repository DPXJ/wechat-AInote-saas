import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI 信迹",
    short_name: "AI 信迹",
    description: "AI 知识收件箱、文件时间线和待办同步工具。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#18181b",
    orientation: "portrait",
    icons: [
      {
        src: "/window.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    categories: ["productivity", "utilities"],
  };
}
