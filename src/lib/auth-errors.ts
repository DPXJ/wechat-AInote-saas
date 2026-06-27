const AUTH_ERROR_MAP: Record<string, string> = {
  "Failed to fetch": "无法连接认证服务，请稍后重试。若持续失败，请联系管理员检查服务器网络配置。",
  "Invalid login credentials": "邮箱或密码错误",
  "Email not confirmed": "邮箱尚未确认，请查收注册确认邮件后再登录",
  "User already registered": "该邮箱已注册，请直接登录或找回密码",
  "Password should be at least 6 characters": "密码至少需要 6 位",
  "Unable to validate email address: invalid format": "邮箱格式不正确",
  "Signup requires a valid password": "请填写有效密码",
};

export function formatAuthError(message: string | undefined, fallback = "操作失败，请重试"): string {
  if (!message) return fallback;
  return AUTH_ERROR_MAP[message] ?? message;
}
