const FOCUSED_ROUTES = [
  /^\/expenses\/new$/,
  /^\/expenses\/[0-9a-f-]{36}$/i,
  /^\/groups\/new$/,
  /^\/groups\/[0-9a-f-]{36}\/settings$/i,
  /^\/groups\/[0-9a-f-]{36}\/expenses\/(?:new|[0-9a-f-]{36})$/i,
  /^\/groups\/[0-9a-f-]{36}\/settle\/[0-9a-f-]{36}$/i,
  /^\/groups\/[0-9a-f-]{36}\/settlements\/[0-9a-f-]{36}$/i,
  /^\/profile\/edit$/,
];

export function shouldShowMobileBottomNav(pathname: string): boolean {
  return !FOCUSED_ROUTES.some((pattern) => pattern.test(pathname));
}
