import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMetricValue,
  classifyService,
  formatMetricValue,
  metricDefinitions,
} from "../app/cloud-usage.ts";

test("누적 지표는 모든 시계열 포인트를 합산한다", () => {
  const series = [
    {
      points: [
        { value: { int64Value: "3" } },
        { value: { doubleValue: 2.5 } },
      ],
    },
    {
      points: [{ value: { distributionValue: { count: "4" } } }],
    },
  ];

  assert.equal(calculateMetricValue(series, "sum"), 9.5);
});

test("현재량 지표는 각 시계열의 최신 포인트만 합산한다", () => {
  const series = [
    {
      points: [
        { value: { int64Value: "1000" } },
        { value: { int64Value: "900" } },
      ],
    },
    {
      points: [
        { value: { int64Value: "500" } },
        { value: { int64Value: "450" } },
      ],
    },
  ];

  assert.equal(calculateMetricValue(series, "latest"), 1500);
});

test("서비스 분류와 사용량 단위를 사용자용 문자열로 변환한다", () => {
  assert.equal(classifyService("firestore.googleapis.com"), "Firebase");
  assert.equal(classifyService("monitoring.googleapis.com"), "시스템");
  assert.equal(classifyService("bigquery.googleapis.com"), "Google Cloud");
  assert.equal(formatMetricValue(1_500_000_000, "bytes"), "1.5 GB");
  assert.match(formatMetricValue(1200, "count"), /1,200회/);
});

test("Storage는 객체 수가 아닌 현재 저장 용량으로 정의한다", () => {
  const storage = metricDefinitions.find(
    (definition) => definition.key === "storage-size",
  );

  assert.equal(
    storage?.metricType,
    "storage.googleapis.com/storage/total_bytes",
  );
  assert.equal(storage?.reducer, "latest");
});
