import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Next 앱의 브랜드와 OAuth 설정이 환경 설정으로 분리되어 있다", async () => {
  const [config, page, layout, example] = await Promise.all([
    read("app/site-config.ts"),
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read(".env.example"),
  ]);

  assert.match(config, /NEXT_PUBLIC_APP_NAME/);
  assert.match(config, /NEXT_PUBLIC_GOOGLE_CLIENT_ID/);
  assert.match(config, /NEXT_PUBLIC_STORAGE_KEY/);
  assert.match(page, /siteConfig\.storageKey/);
  assert.match(page, /siteConfig\.accentColor/);
  assert.match(layout, /siteConfig\.description/);
  assert.match(example, /NEXT_PUBLIC_ACCENT_COLOR/);
});

test("Firebase 정적 앱은 배포 주소와 브랜드를 런타임에 설정한다", async () => {
  const [html, app, config, firebaseRc] = await Promise.all([
    read("firebase-dist/index.html"),
    read("firebase-dist/app.js"),
    read("firebase-dist/config.js"),
    read(".firebaserc"),
  ]);

  assert.ok(html.indexOf('src="config.js"') < html.indexOf('src="app.js"'));
  assert.match(config, /CLOUDSCOPE_CONFIG/);
  assert.match(app, /location\.origin/);
  assert.match(app, /config\.googleClientId/);
  assert.doesNotMatch(html, /checklendar/i);
  assert.doesNotMatch(firebaseRc, /checklendar/i);
  assert.match(firebaseRc, /YOUR_FIREBASE_PROJECT_ID/);
});

test("공개 OAuth ID만 저장하고 액세스 토큰 저장은 하지 않는다", async () => {
  const [page, staticApp] = await Promise.all([
    read("app/page.tsx"),
    read("firebase-dist/app.js"),
  ]);

  assert.doesNotMatch(page, /localStorage\.setItem\([^,]+,\s*token\b/);
  assert.doesNotMatch(staticApp, /localStorage\.setItem\([^,]+,\s*token\b/);
});
