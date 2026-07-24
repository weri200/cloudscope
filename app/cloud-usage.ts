export type ServiceGroup = "Firebase" | "Google Cloud" | "시스템";
export type MetricUnit = "count" | "bytes";
export type MetricReducer = "sum" | "latest";

export type MetricDefinition = {
  key: string;
  name: string;
  group: ServiceGroup;
  serviceApi: string;
  metricType: string;
  unit: MetricUnit;
  color: string;
  reducer: MetricReducer;
};

export type MetricStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable";

export type MetricCard = MetricDefinition & {
  kind: "metric";
  status: MetricStatus;
  value?: number;
  error?: string;
};

export type EnabledServiceCard = {
  kind: "service";
  key: string;
  name: string;
  group: ServiceGroup;
  serviceApi: string;
  color: string;
  status: "enabled";
};

export type ServiceCard = MetricCard | EnabledServiceCard;

export type MonitoringPoint = {
  value?: {
    int64Value?: string | number;
    doubleValue?: string | number;
    distributionValue?: { count?: string | number };
  };
};

export type MonitoringSeries = {
  points?: MonitoringPoint[];
};

export const metricDefinitions: MetricDefinition[] = [
  {
    key: "firestore-reads",
    name: "Firestore 읽기",
    group: "Firebase",
    serviceApi: "firestore.googleapis.com",
    metricType: "firestore.googleapis.com/document/read_count",
    unit: "count",
    color: "#f7a21b",
    reducer: "sum",
  },
  {
    key: "firestore-writes",
    name: "Firestore 쓰기",
    group: "Firebase",
    serviceApi: "firestore.googleapis.com",
    metricType: "firestore.googleapis.com/document/write_count",
    unit: "count",
    color: "#ff6d45",
    reducer: "sum",
  },
  {
    key: "storage-size",
    name: "Cloud Storage 용량",
    group: "Google Cloud",
    serviceApi: "storage.googleapis.com",
    metricType: "storage.googleapis.com/storage/total_bytes",
    unit: "bytes",
    color: "#4285f4",
    reducer: "latest",
  },
  {
    key: "cloud-run-requests",
    name: "Cloud Run 요청",
    group: "Google Cloud",
    serviceApi: "run.googleapis.com",
    metricType: "run.googleapis.com/request_count",
    unit: "count",
    color: "#7b61ff",
    reducer: "sum",
  },
  {
    key: "functions-executions",
    name: "Cloud Functions 실행",
    group: "Firebase",
    serviceApi: "cloudfunctions.googleapis.com",
    metricType: "cloudfunctions.googleapis.com/function/execution_count",
    unit: "count",
    color: "#11a879",
    reducer: "sum",
  },
  {
    key: "hosting-egress",
    name: "Firebase Hosting 전송량",
    group: "Firebase",
    serviceApi: "firebasehosting.googleapis.com",
    metricType: "firebasehosting.googleapis.com/network/sent_bytes_count",
    unit: "bytes",
    color: "#ea4335",
    reducer: "sum",
  },
];

const serviceColors = ["#3b82f6", "#8b5cf6", "#0ea5a4", "#64748b"];

export function initialMetricCards(
  status: MetricStatus = "idle",
): MetricCard[] {
  return metricDefinitions.map((definition) => ({
    ...definition,
    kind: "metric",
    status,
  }));
}

export function classifyService(
  apiName: string,
  title = "",
): ServiceGroup {
  const value = `${apiName} ${title}`.toLowerCase();

  if (/firebase|firestore|identitytoolkit|fcm|securetoken/.test(value)) {
    return "Firebase";
  }

  if (
    /logging|monitoring|serviceusage|servicemanagement|cloudbilling|iam|resource manager/.test(
      value,
    )
  ) {
    return "시스템";
  }

  return "Google Cloud";
}

export function enabledServiceCard(
  apiName: string,
  title: string | undefined,
  index: number,
): EnabledServiceCard {
  const name = title?.trim() || apiName.replace(/\.googleapis\.com$/, "");

  return {
    kind: "service",
    key: `enabled-${apiName}`,
    name,
    group: classifyService(apiName, name),
    serviceApi: apiName,
    color: serviceColors[index % serviceColors.length],
    status: "enabled",
  };
}

export function calculateMetricValue(
  series: MonitoringSeries[],
  reducer: MetricReducer,
): number {
  if (reducer === "latest") {
    return series.reduce(
      (total, item) => total + pointValue(item.points?.[0]),
      0,
    );
  }

  return series.reduce(
    (total, item) =>
      total +
      (item.points ?? []).reduce(
        (subtotal, point) => subtotal + pointValue(point),
        0,
      ),
    0,
  );
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  if (unit === "bytes") {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let normalized = value;
    let unitIndex = 0;

    while (Math.abs(normalized) >= 1000 && unitIndex < units.length - 1) {
      normalized /= 1000;
      unitIndex += 1;
    }

    return `${new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: unitIndex === 0 ? 0 : 1,
    }).format(normalized)} ${units[unitIndex]}`;
  }

  return `${new Intl.NumberFormat("ko-KR", {
    notation: Math.abs(value) > 9999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)}회`;
}

function pointValue(point: MonitoringPoint | undefined): number {
  const value = point?.value;
  const raw =
    value?.int64Value ??
    value?.doubleValue ??
    value?.distributionValue?.count ??
    0;
  const numeric = Number(raw);

  return Number.isFinite(numeric) ? numeric : 0;
}
