const TIME_PATTERNS = [
  /(\d{1,2})[:.：](\d{2})/,
  /(上午|下午|晚上|凌晨)?\s*(\d{1,2})\s*[点时]/,
  /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/,
  /(明天|后天|今天|下周[一二三四五六日天])/,
  /(周[一二三四五六日天])/,
];

export function extractTimeInfo(text: string): string | null {
  for (const pattern of TIME_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export function isTimeSoon(text: string, withinMinutes = 30): boolean {
  const now = new Date();
  const timeMatch = text.match(/(\d{1,2})[:.：](\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    const diff = target.getTime() - now.getTime();
    return diff > 0 && diff <= withinMinutes * 60 * 1000;
  }
  return false;
}

export function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return Promise.resolve(false);
  if (Notification.permission === "granted") return Promise.resolve(true);
  if (Notification.permission === "denied") return Promise.resolve(false);
  return Notification.requestPermission().then((p) => p === "granted");
}

export function showNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.ico" });
}
