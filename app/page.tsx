"use client";

import Script from "next/script";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  calculateMetricValue,
  enabledServiceCard,
  formatMetricValue,
  initialMetricCards,
  metricDefinitions,
  type MetricCard,
  type MetricDefinition,
  type MonitoringSeries,
  type ServiceCard,
  type ServiceGroup,
} from "./cloud-usage";
import { siteConfig } from "./site-config";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type Project = {
  name: string;
  projectId: string;
  displayName: string;
  state: string;
};

type ProjectSearchResponse = {
  projects?: Project[];
  nextPageToken?: string;
};

type MonitoringResponse = {
  timeSeries?: MonitoringSeries[];
  nextPageToken?: string;
};

type ServiceUsageResponse = {
  services?: Array<{
    name?: string;
    config?: {
      name?: string;
      title?: string;
    };
  }>;
  nextPageToken?: string;
};

type BillingResponse = {
  billingEnabled?: boolean;
};

type BillingState = "unknown" | "enabled" | "disabled";
type GroupFilter = "all" | ServiceGroup;
type SortOption = "status" | "name";
type ApiClient = <T>(url: string, accessToken?: string) => Promise<T>;

const scopes = [
  "https://www.googleapis.com/auth/cloud-platform.read-only",
  "https://www.googleapis.com/auth/monitoring.read",
  "https://www.googleapis.com/auth/cloud-billing.readonly",
].join(" ");

const legacyStorageKeys = [
  "cloudscope_google_client_id",
  "cloud-usage-dashboard.google-client-id",
];

async function listProjects(
  api: ApiClient,
  accessToken: string,
): Promise<Project[]> {
  const projects: Project[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await api<ProjectSearchResponse>(
      `https://cloudresourcemanager.googleapis.com/v3/projects:search?${params}`,
      accessToken,
    );

    projects.push(
      ...(data.projects ?? []).filter((project) => project.state === "ACTIVE"),
    );
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return projects;
}

async function listEnabledServices(
  api: ApiClient,
  project: Project,
): Promise<ServiceCard[]> {
  const projectNumber = project.name?.split("/").pop();
  if (!projectNumber) {
    throw new Error("프로젝트 번호를 확인할 수 없습니다.");
  }

  const services: ServiceCard[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      filter: "state:ENABLED",
      pageSize: "200",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await api<ServiceUsageResponse>(
      `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectNumber)}/services?${params}`,
    );

    for (const item of data.services ?? []) {
      const apiName =
        item.config?.name ??
        item.name?.split("/").pop() ??
        "unknown.googleapis.com";

      services.push(
        enabledServiceCard(apiName, item.config?.title, services.length),
      );
    }

    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return services;
}

async function queryMetric(
  api: ApiClient,
  projectId: string,
  definition: MetricDefinition,
  start: Date,
  end: Date,
): Promise<MetricCard> {
  const series: MonitoringSeries[] = [];
  let pageToken = "";

  try {
    do {
      const params = new URLSearchParams({
        filter: `metric.type = "${definition.metricType}"`,
        "interval.startTime": start.toISOString(),
        "interval.endTime": end.toISOString(),
        view: "FULL",
        pageSize: "10000",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const data = await api<MonitoringResponse>(
        `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`,
      );

      series.push(...(data.timeSeries ?? []));
      pageToken = data.nextPageToken ?? "";
    } while (pageToken);

    return {
      ...definition,
      kind: "metric",
      status: "ready",
      value: calculateMetricValue(series, definition.reducer),
    };
  } catch (error) {
    return {
      ...definition,
      kind: "metric",
      status: "unavailable",
      error:
        error instanceof Error ? error.message : "지표를 조회하지 못했습니다.",
    };
  }
}

function statusRank(card: ServiceCard): number {
  if (card.status === "ready") return 0;
  if (card.status === "loading") return 1;
  if (card.status === "enabled") return 2;
  if (card.status === "unavailable") return 3;
  return 4;
}

export default function Home() {
  const [clientId, setClientId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [days, setDays] = useState(7);
  const [cards, setCards] = useState<ServiceCard[]>(initialMetricCards());
  const [enabledCount, setEnabledCount] = useState<number | null>(null);
  const [billing, setBilling] = useState<BillingState>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("status");
  const usageRequest = useRef(0);

  useEffect(() => {
    queueMicrotask(() => {
      const saved =
        localStorage.getItem(siteConfig.storageKey) ||
        legacyStorageKeys
          .map((key) => localStorage.getItem(key))
          .find(Boolean) ||
        siteConfig.defaultGoogleClientId;

      if (saved && !localStorage.getItem(siteConfig.storageKey)) {
        localStorage.setItem(siteConfig.storageKey, saved);
      }

      setClientId(saved);
      setDraftId(saved);
      setShowSetup(!saved);
    });
  }, []);

  const api = useCallback(
    async <T,>(url: string, accessToken = token): Promise<T> => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message ?? `Google API 요청 실패 (${response.status})`,
        );
      }

      return (await response.json()) as T;
    },
    [token],
  );

  const loadProjects = useCallback(
    async (accessToken: string) => {
      setBusy(true);
      setError("");

      try {
        const projectList = await listProjects(api, accessToken);
        setProjects(projectList);
        setProjectId(projectList[0]?.projectId ?? "");

        if (projectList.length === 0) {
          setError("현재 계정으로 조회 가능한 활성 프로젝트가 없습니다.");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "프로젝트를 불러오지 못했습니다.",
        );
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const queryUsage = useCallback(async () => {
    const project = projects.find((item) => item.projectId === projectId);
    if (!token || !project) return;

    const requestId = ++usageRequest.current;
    setBusy(true);
    setError("");
    setBilling("unknown");
    setEnabledCount(null);
    setCards(initialMetricCards("loading"));

    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);

    const billingPromise = api<BillingResponse>(
      `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`,
    )
      .then<BillingState>((result) =>
        result.billingEnabled ? "enabled" : "disabled",
      )
      .catch<BillingState>(() => "unknown");

    const servicesPromise = listEnabledServices(api, project)
      .then((services) => ({ services, serviceError: "" }))
      .catch((serviceError: unknown) => ({
        services: [] as ServiceCard[],
        serviceError:
          serviceError instanceof Error
            ? serviceError.message
            : "활성 서비스 목록을 조회하지 못했습니다.",
      }));

    try {
      const [metricCards, serviceResult, billingResult] = await Promise.all([
        Promise.all(
          metricDefinitions.map((definition) =>
            queryMetric(api, projectId, definition, start, end),
          ),
        ),
        servicesPromise,
        billingPromise,
      ]);

      if (requestId !== usageRequest.current) return;

      const measuredApis = new Set(
        metricDefinitions.map((definition) => definition.serviceApi),
      );
      const servicesWithoutMetric = serviceResult.services.filter(
        (service) => !measuredApis.has(service.serviceApi),
      );

      setCards([...metricCards, ...servicesWithoutMetric]);
      setEnabledCount(
        serviceResult.serviceError ? null : serviceResult.services.length,
      );
      setBilling(billingResult);

      if (serviceResult.serviceError) {
        setError(
          `지표는 조회했지만 활성 서비스 목록은 불러오지 못했습니다: ${serviceResult.serviceError}`,
        );
      }
    } finally {
      if (requestId === usageRequest.current) setBusy(false);
    }
  }, [api, days, projectId, projects, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (token && projectId) void queryUsage();
    }, 0);

    return () => clearTimeout(timer);
  }, [token, projectId, days, queryUsage]);

  const saveClient = () => {
    const id = draftId.trim();
    localStorage.setItem(siteConfig.storageKey, id);
    setClientId(id);
    setShowSetup(false);
    setError("");
  };

  const connect = () => {
    if (!clientId) {
      setShowSetup(true);
      return;
    }

    if (!window.google) {
      setError(
        "Google 로그인 모듈을 불러오는 중입니다. 잠시 후 다시 눌러주세요.",
      );
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes,
      callback: (response) => {
        if (response.access_token) {
          setToken(response.access_token);
          void loadProjects(response.access_token);
        } else {
          setError(response.error || "로그인이 취소되었습니다.");
        }
      },
    });

    client.requestAccessToken({ prompt: "consent" });
  };

  const disconnect = () => {
    usageRequest.current += 1;
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token, () => {});
    }

    setToken("");
    setProjects([]);
    setProjectId("");
    setCards(initialMetricCards());
    setEnabledCount(null);
    setBilling("unknown");
    setError("");
  };

  const visibleCards = useMemo(() => {
    const filtered =
      groupFilter === "all"
        ? [...cards]
        : cards.filter((card) => card.group === groupFilter);

    return filtered.sort((left, right) => {
      if (sortOption === "status") {
        const rankDifference = statusRank(left) - statusRank(right);
        if (rankDifference !== 0) return rankDifference;
      }

      return left.name.localeCompare(right.name, "ko");
    });
  }, [cards, groupFilter, sortOption]);

  const readyCount = cards.filter((card) => card.status === "ready").length;
  const unavailableCount = cards.filter(
    (card) => card.status === "unavailable",
  ).length;
  const selectedProject = projects.find(
    (project) => project.projectId === projectId,
  );

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      <main style={{ "--blue": siteConfig.accentColor } as CSSProperties}>
        <header>
          <div className="brand">
            <span className="brandMark">{siteConfig.mark}</span>
            <span>{siteConfig.name}</span>
            <b>{siteConfig.badge}</b>
          </div>
          <div className="headerActions">
            <button className="ghost" onClick={() => setShowSetup(true)}>
              연결 설정
            </button>
            {token ? (
              <button
                className="avatar"
                onClick={disconnect}
                title="로그아웃"
              >
                ME
              </button>
            ) : (
              <button className="primary small" onClick={connect}>
                Google 계정 연결
              </button>
            )}
          </div>
        </header>

        <section className="hero">
          <div>
            <p className="kicker">{siteConfig.ownerLabel}, ONE VIEW</p>
            <h1>
              내 클라우드 사용량을
              <br />
              <em>한눈에.</em>
            </h1>
            <p className="lead">
              Google Cloud와 Firebase 프로젝트의 실제 사용량을
              <br className="desktop" /> 개인 대시보드에서 안전하게
              확인하세요.
            </p>
          </div>
          <div className="statusCard">
            <div className={`statusIcon ${token ? "connected" : ""}`}>
              {token ? "✓" : "↗"}
            </div>
            <div>
              <span>연결 상태</span>
              <strong>
                {token
                  ? `${projects.length}개 프로젝트 연결됨`
                  : "Google 계정 연결 필요"}
              </strong>
              <small>
                {token
                  ? "토큰은 이 브라우저 세션에만 보관됩니다."
                  : "서비스 계정 키를 저장하지 않습니다."}
              </small>
            </div>
          </div>
        </section>

        {error && (
          <div className="error">
            <span>!</span>
            <p>
              {error}
              <small>
                필요한 API와 현재 계정의 조회 권한을 확인해 주세요.
              </small>
            </p>
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        <section className="controls">
          <label>
            <span>프로젝트</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={!token || busy}
            >
              <option value="">
                {busy && projects.length === 0
                  ? "불러오는 중..."
                  : "프로젝트 선택"}
              </option>
              {projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.displayName} · {project.projectId}
                </option>
              ))}
            </select>
          </label>
          <div className="period">
            <span>조회 기간</span>
            <div>
              {[1, 7, 30].map((period) => (
                <button
                  key={period}
                  className={days === period ? "on" : ""}
                  onClick={() => setDays(period)}
                >
                  {period === 1 ? "오늘" : `${period}일`}
                </button>
              ))}
            </div>
          </div>
          <button
            className="refresh"
            onClick={() => void queryUsage()}
            disabled={!projectId || busy}
          >
            {busy ? "동기화 중..." : "↻ 새로고침"}
          </button>
        </section>

        <section className="summary">
          <article>
            <span>선택한 프로젝트</span>
            <strong>{selectedProject?.displayName || "연결 전"}</strong>
            <small>{projectId || "Google 계정을 먼저 연결하세요"}</small>
          </article>
          <article>
            <span>조회 가능한 지표</span>
            <strong>
              {token ? `${readyCount} / ${metricDefinitions.length}` : "—"}
            </strong>
            <small>
              {unavailableCount
                ? `${unavailableCount}개 지표 확인 필요`
                : "Cloud Monitoring 기준"}
            </small>
          </article>
          <article>
            <span>활성화된 서비스</span>
            <strong>{enabledCount === null ? "—" : `${enabledCount}개`}</strong>
            <small>Service Usage API 기준</small>
          </article>
          <article>
            <span>결제 계정</span>
            <strong className={billing === "enabled" ? "green" : ""}>
              {billing === "enabled"
                ? "연결됨"
                : billing === "disabled"
                  ? "연결 안 됨"
                  : "—"}
            </strong>
            <small>프로젝트 결제 활성화 상태</small>
          </article>
        </section>

        <section className="usageSection">
          <div className="sectionHead">
            <div>
              <p className="kicker">SERVICE USAGE</p>
              <h2>활성화된 모든 서비스</h2>
            </div>
            <span className="synced">
              {busy ? <i /> : "✓"}{" "}
              {busy ? "데이터 동기화 중" : token ? "최신 데이터" : "연결 대기"}
            </span>
          </div>

          <div className="serviceTools">
            <div>
              <label>
                분류 필터
                <select
                  value={groupFilter}
                  onChange={(event) =>
                    setGroupFilter(event.target.value as GroupFilter)
                  }
                >
                  <option value="all">전체 서비스</option>
                  <option value="Firebase">Firebase</option>
                  <option value="Google Cloud">Google Cloud</option>
                  <option value="시스템">시스템 API</option>
                </select>
              </label>
              <label>
                정렬
                <select
                  value={sortOption}
                  onChange={(event) =>
                    setSortOption(event.target.value as SortOption)
                  }
                >
                  <option value="status">사용량 조회 가능 순</option>
                  <option value="name">서비스명 순</option>
                </select>
              </label>
            </div>
            <strong>{visibleCards.length}개 항목</strong>
          </div>

          <div className="usageGrid">
            {visibleCards.map((card, index) => (
              <a
                className="serviceLink"
                href={`https://console.cloud.google.com/apis/library/${encodeURIComponent(card.serviceApi)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`}
                target="_blank"
                rel="noopener noreferrer"
                key={card.key}
                aria-label={`${card.name} API 관리 페이지 열기`}
              >
                <article className="usageCard">
                  <div className="cardTop">
                    <span
                      className="serviceNo"
                      style={{
                        color: card.color,
                        background: `${card.color}15`,
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`pill ${
                        card.group === "Firebase" ? "fire" : ""
                      }`}
                    >
                      {card.group}
                    </span>
                  </div>
                  <h3>{card.name}</h3>
                  <div className="usageValue">
                    {card.status === "loading" ? (
                      <span className="skeleton" />
                    ) : card.status === "ready" ? (
                      formatMetricValue(card.value ?? 0, card.unit)
                    ) : card.status === "enabled" ? (
                      <span className="enabledText">활성화됨</span>
                    ) : card.status === "unavailable" ? (
                      <>
                        <span className="unavailable">사용량 확인 불가</span>
                        <small className="metricDetail" title={card.error}>
                          {card.error}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="cardFoot">
                    <span>
                      {card.status === "ready"
                        ? card.reducer === "latest"
                          ? "현재 합계"
                          : days === 1
                            ? "오늘 합계"
                            : `최근 ${days}일 합계`
                        : card.status === "enabled"
                          ? card.serviceApi
                          : "API 또는 지표 확인 필요"}
                    </span>
                    <span className="consoleArrow">API 관리 ↗</span>
                  </div>
                </article>
              </a>
            ))}
          </div>

          {visibleCards.length === 0 && (
            <div className="emptyState">선택한 분류에 해당하는 서비스가 없습니다.</div>
          )}
        </section>

        <section className="privacy">
          <div className="lock">⌁</div>
          <div>
            <strong>개인정보는 브라우저 밖으로 나가지 않습니다.</strong>
            <p>
              OAuth 액세스 토큰은 메모리에만 유지되며 서버나 데이터베이스에
              저장하지 않습니다. 브라우저를 닫으면 연결이 종료됩니다.
            </p>
          </div>
        </section>

        <footer>
          <span>{siteConfig.name}</span>
          <p>
            Google Cloud 공식 API를 사용하는 개인용 도구 · 비용 금액은
            Billing Export 설정 시 별도 연동이 필요합니다.
          </p>
        </footer>
      </main>

      {showSetup && (
        <div
          className="modalBackdrop"
          onMouseDown={() => clientId && setShowSetup(false)}
        >
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button
              className="modalClose"
              onClick={() => clientId && setShowSetup(false)}
            >
              ×
            </button>
            <p className="kicker">ONE-TIME SETUP</p>
            <h2>Google OAuth 연결 설정</h2>
            <p className="modalLead">
              Google Cloud Console에서 만든{" "}
              <b>웹 애플리케이션 OAuth 클라이언트 ID</b>를 입력하세요. 값은
              이 브라우저에만 저장됩니다.
            </p>
            <ol>
              <li>Google Cloud Console에서 OAuth 동의 화면을 설정합니다.</li>
              <li>
                OAuth 클라이언트 ID 유형을 <b>웹 애플리케이션</b>으로
                만듭니다.
              </li>
              <li>
                승인된 JavaScript 원본에{" "}
                <code>
                  {typeof location !== "undefined"
                    ? location.origin
                    : "현재 사이트 주소"}
                </code>
                를 추가합니다.
              </li>
            </ol>
            <label className="clientInput">
              <span>OAuth 클라이언트 ID</span>
              <input
                value={draftId}
                onChange={(event) => setDraftId(event.target.value)}
                placeholder="000000000000-xxxx.apps.googleusercontent.com"
                autoFocus
              />
            </label>
            <button
              className="primary full"
              onClick={saveClient}
              disabled={!draftId.trim().endsWith(".apps.googleusercontent.com")}
            >
              저장하고 계속
            </button>
            <p className="scopeNote">
              요청 권한: 프로젝트·Monitoring·서비스·결제 상태 읽기 전용
            </p>
          </div>
        </div>
      )}
    </>
  );
}
