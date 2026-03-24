/** 构建时由 next.config 注入 package.json 的 version，用于线上核对是否已部署最新构建 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
