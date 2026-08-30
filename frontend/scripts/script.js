"use strict";

import { API_URL } from "./config.js";

const benchmarkForm = document.getElementById("benchmark-form");
const benchmarkQuery = document.getElementById("benchmark-query");
const benchmarkRun = document.getElementById("benchmark-run");
const benchmarkStatus = document.getElementById("benchmark-status");
const benchmarkActiveQuery = document.getElementById("benchmark-active-query");

const versions = [
    { id: "v1", endpoint: "/api/v1/search" },
    { id: "v2", endpoint: "/api/v2/search" },
    { id: "v3", endpoint: "/api/v3/search" },
    { id: "v4", endpoint: "/api/v4/search" },
    { id: "v5", endpoint: "/api/v5/search", cachePasses: 2 },
];

function formatMilliseconds(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)} ms` : "—";
}

function formatCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : "—";
}

function getPlanRoot(queryPlan) {
    if (!queryPlan) return null;
    return Array.isArray(queryPlan) ? queryPlan[0] ?? null : queryPlan;
}

function findPlanOperation(queryPlan) {
    const plan = getPlanRoot(queryPlan)?.Plan;
    if (!plan) return null;

    const priority = ["Bitmap Index Scan", "Index Only Scan", "Index Scan", "Bitmap Heap Scan", "Seq Scan"];
    let selected = plan["Node Type"] ?? "Unknown";
    const nodes = [plan];

    while (nodes.length) {
        const node = nodes.shift();
        const type = node["Node Type"];
        const currentPriority = priority.indexOf(selected);
        const nextPriority = priority.indexOf(type);
        if (nextPriority !== -1 && (currentPriority === -1 || nextPriority < currentPriority)) {
            selected = type;
        }
        nodes.push(...(node.Plans ?? []));
    }

    return selected;
}

function getApplicationTime(data) {
    return data.metrics?.application_time_ms ?? data.metrics?.execution_time_ms ?? null;
}

function setRow(id, values, state) {
    const row = document.querySelector(`[data-benchmark-version="${id}"]`);
    row.dataset.state = state;
    for (const [field, value] of Object.entries(values)) {
        const target = row.querySelector(`[data-field="${field}"]`);
        if (target) target.textContent = value;
    }
}

async function requestVersion(version, query) {
    const url = new URL(`${API_URL}${version.endpoint}`, window.location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "10");
    url.searchParams.set("offset", "0");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);

    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });

        if (!response.ok) {
            let detail = `HTTP ${response.status}`;
            try {
                const payload = await response.json();
                if (payload.detail) detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
            } catch {
                // Keep the HTTP fallback.
            }
            throw new Error(detail);
        }

        return response.json();
    } finally {
        window.clearTimeout(timeout);
    }
}

async function runBenchmark(query) {
    benchmarkRun.disabled = true;
    benchmarkStatus.dataset.state = "running";
    benchmarkActiveQuery.textContent = `“${query}”`;

    for (const version of versions) {
        setRow(version.id, { results: "…", app: "…", db: "…", plan: "Running" }, "running");
        benchmarkStatus.textContent = `Running ${version.id.toUpperCase()} of V5…`;

        try {
            let data = await requestVersion(version, query);
            if (version.cachePasses) data = await requestVersion(version, query);

            const root = getPlanRoot(data.query_plan);
            const cacheHit = Boolean(data.cache?.hit);
            setRow(version.id, {
                results: formatCount(data.total_count ?? data.count),
                app: formatMilliseconds(getApplicationTime(data)),
                db: cacheHit ? "Bypassed" : formatMilliseconds(root?.["Execution Time"]),
                plan: cacheHit ? "Redis hit" : findPlanOperation(data.query_plan) ?? "Unavailable",
            }, "complete");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed";
            setRow(version.id, { results: "Error", app: "—", db: "—", plan: message }, "error");
        }
    }

    benchmarkStatus.dataset.state = "complete";
    benchmarkStatus.textContent = "Benchmark complete. V5 shows its warmed cache path.";
    benchmarkRun.disabled = false;
}

benchmarkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = benchmarkQuery.value.trim();
    if (!query) {
        benchmarkStatus.dataset.state = "error";
        benchmarkStatus.textContent = "Enter a benchmark query.";
        return;
    }

    try {
        await runBenchmark(query);
    } catch (error) {
        benchmarkStatus.dataset.state = "error";
        benchmarkStatus.textContent = error instanceof Error ? error.message : "Benchmark failed.";
        benchmarkRun.disabled = false;
    }
});
