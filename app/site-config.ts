const read = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const readColor = (value: string | undefined, fallback: string) => {
  const color = value?.trim();
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
};

export const siteConfig = {
  name: read(process.env.NEXT_PUBLIC_APP_NAME, "Cloudscope"),
  badge: read(process.env.NEXT_PUBLIC_APP_BADGE, "PERSONAL"),
  mark: read(process.env.NEXT_PUBLIC_APP_MARK, "C").slice(0, 2),
  ownerLabel: read(process.env.NEXT_PUBLIC_OWNER_LABEL, "MY CLOUD"),
  description: read(
    process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    "Google Cloud와 Firebase 사용량을 한눈에 확인하는 개인용 대시보드",
  ),
  accentColor: readColor(process.env.NEXT_PUBLIC_ACCENT_COLOR, "#2962ff"),
  defaultGoogleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "",
  storageKey: read(
    process.env.NEXT_PUBLIC_STORAGE_KEY,
    "cloudscope.google-client-id",
  ),
} as const;
