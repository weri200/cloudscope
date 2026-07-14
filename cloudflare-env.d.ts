/**
 * 이 프로젝트가 실제로 사용하는 Cloudflare 바인딩의 최소 타입입니다.
 * `wrangler types`로 생성한 타입 파일을 도입하면 이 선언을 교체할 수 있습니다.
 */
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  readonly __D1DatabaseBrand?: never;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
