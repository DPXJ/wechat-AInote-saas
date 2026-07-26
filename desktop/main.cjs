/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell } = require("electron");

const DEFAULT_APP_URL = "https://aixinji.linknewai.com";
const appUrl = process.env.AI_XINJI_DESKTOP_URL || DEFAULT_APP_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "AI 信迹",
    backgroundColor: "#09090b",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(appUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    const appHost = new URL(appUrl).host;
    if (target.host === appHost) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
