#!/usr/bin/env node
import process from "node:process";

const baseUrl = (process.env.APP_BASE_URL || process.env.KEEPALIVE_URL || "https://aixinji.linknewai.com")
  .replace(/\/+$/, "");
const token = process.env.HEALTHCHECK_TOKEN || "";
const url = new URL(`${baseUrl}/api/health`);
if (token) url.searchParams.set("token", token);

const res = await fetch(url, { cache: "no-store" });
const text = await res.text();

if (!res.ok) {
  console.error(`[keepalive] failed ${res.status}: ${text}`);
  process.exit(1);
}

console.log(`[keepalive] ok ${new Date().toISOString()} ${text}`);
