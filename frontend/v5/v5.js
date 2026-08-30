"use strict";

import { API_URL } from "../scripts/config.js";


const SEARCH_ENDPOINT = `${API_URL}/api/v5/search`;
const PAGE_SIZE = 10;

const byId = (id) => document.getElementById(id);

const searchForm = byId("search-form");
const searchInput = byId("search-input");
const searchButton = byId("search-button");
const clearSearchButton = byId("clear-search-button");
const initialState = byId("initial-state");
const loadingState = byId("loading-state");
const errorState = byId("error-state");
const errorMessage = byId("error-message");
const searchOutput = byId("search-output");

const reportQuery = byId("report-query");
const metricResultCount = byId("metric-result-count");
const metricApplicationTime = byId("metric-application-time");
const metricCacheLookup = byId("metric-cache-lookup");
const metricPeakMemory = byId("metric-peak-memory");

const cacheStatusBadge = byId("cache-status-badge");
const cacheHitStatus = byId("cache-hit-status");
const cacheHitDescription = byId("cache-hit-description");
const cacheLookupTime = byId("cache-lookup-time");
const cacheWriteTime = byId("cache-write-time");
const cacheTtl = byId("cache-ttl");
const cacheTtlRemaining = byId("cache-ttl-remaining");
const cacheKey = byId("cache-key");

const databaseStatusBadge = byId("database-status-badge");
const databaseExecuted = byId("database-executed");
const databaseExecutedDescription = byId("database-executed-description");
const databaseFtsAttempted = byId("database-fts-attempted");
const databaseFuzzyAttempted = byId("database-fuzzy-attempted");
const databaseExplainExecuted = byId("database-explain-executed");

const strategyBadge = byId("strategy-badge");
const strategyName = byId("strategy-name");
const strategyEngine = byId("strategy-engine");
const strategyFallbackUsed = byId("strategy-fallback-used");

const timingCacheLookup = byId("timing-cache-lookup");
const timingFts = byId("timing-fts");
const timingFuzzy = byId("timing-fuzzy");
const timingCacheWrite = byId("timing-cache-write");
const timingExplain = byId("timing-explain");
const timingApplicationTotal = byId("timing-application-total");

const postgresReportDescription = byId("postgres-report-description");
const planScanBadge = byId("plan-scan-badge");
const postgresBypassed = byId("postgres-bypassed");
const postgresExecutionContent = byId("postgres-execution-content");
const planPrimaryOperation = byId("plan-primary-operation");
const planPrimaryDescription = byId("plan-primary-description");
const planPlanningTime = byId("plan-planning-time");
const planExecutionTime = byId("plan-execution-time");
const planRowsRemoved = byId("plan-rows-removed");
const planSharedHit = byId("plan-shared-hit");
const planSharedRead = byId("plan-shared-read");
const planFirstRowTime = byId("plan-first-row-time");
const planLastRowTime = byId("plan-last-row-time");
const rawSql = byId("raw-sql");
const rawExplain = byId("raw-explain");

const resultsDescription = byId("results-description");
const resultsVisibleCount = byId("results-visible-count");
const resultsContainer = byId("results-container");
const seeMoreButton = byId("see-more-button");

let currentQuery = "";
let currentOffset = 0;
let loadedResults = [];
let hasMore = false;
let isLoading = false;


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function safeHeadline(value) {
    return escapeHtml(value)
        .replaceAll("&lt;mark&gt;", "<mark>")
        .replaceAll("&lt;/mark&gt;", "</mark>");
}


function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number)
        ? new Intl.NumberFormat().format(number)
        : "—";
}


function formatMilliseconds(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(3)} ms` : "—";
}


function formatMemory(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(3)} MB` : "—";
}


function formatSeconds(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? `${number} s` : "—";
}


function formatPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return "—";
    }

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(number);
}


function yesNo(value) {
    return value ? "Yes" : "No";
}


function setLoading(loading) {
    isLoading = loading;
    searchButton.disabled = loading;
    seeMoreButton.disabled = loading;
    loadingState.classList.toggle("hidden", !loading);
}


function showError(message) {
    errorMessage.textContent = message;
    errorState.classList.remove("hidden");
}


function resetSearchUI() {
    loadedResults = [];
    currentOffset = 0;
    hasMore = false;
    resultsContainer.innerHTML = "";
    resultsVisibleCount.textContent = "0";
    seeMoreButton.classList.add("hidden");
    searchOutput.classList.add("hidden");
    errorState.classList.add("hidden");
}


function getPlanRoot(queryPlan) {
    if (!queryPlan) {
        return null;
    }
    return Array.isArray(queryPlan) ? queryPlan[0] ?? null : queryPlan;
}


function walkPlan(node, callback) {
    if (!node) {
        return;
    }

    callback(node);
    for (const child of node.Plans ?? []) {
        walkPlan(child, callback);
    }
}


function analyzePlan(queryPlan) {
    const root = getPlanRoot(queryPlan);
    const mainPlan = root?.Plan;
    if (!mainPlan) {
        return null;
    }

    let rowsRemoved = 0;
    let sharedHitBlocks = 0;
    let sharedReadBlocks = 0;
    let selectedNode = mainPlan;
    let indexName = null;

    walkPlan(mainPlan, (node) => {
        rowsRemoved += Number(node["Rows Removed by Filter"] ?? 0);
        sharedHitBlocks += Number(node["Shared Hit Blocks"] ?? 0);
        sharedReadBlocks += Number(node["Shared Read Blocks"] ?? 0);

        if (
            ["Seq Scan", "Bitmap Heap Scan", "Index Scan", "Index Only Scan"]
                .includes(node["Node Type"])
        ) {
            if (selectedNode === mainPlan || node["Node Type"] !== "Seq Scan") {
                selectedNode = node;
            }
        }

        if (node["Index Name"] && !indexName) {
            indexName = node["Index Name"];
        }
    });

    const operation = selectedNode["Node Type"] ?? mainPlan["Node Type"] ?? "Unknown";
    let description = "PostgreSQL executed the active search strategy.";

    if (operation === "Seq Scan") {
        description = "PostgreSQL scanned product rows and evaluated the active search predicate.";
    } else if (operation === "Bitmap Heap Scan") {
        description = `PostgreSQL used a bitmap${indexName ? ` from ${indexName}` : ""} to retrieve matching product rows.`;
    } else if (operation.includes("Index")) {
        description = `PostgreSQL used ${indexName ?? "an index"} to retrieve candidates.`;
    }

    return {
        operation,
        description,
        planningTime: root["Planning Time"] ?? null,
        executionTime: root["Execution Time"] ?? null,
        rowsRemoved,
        sharedHitBlocks,
        sharedReadBlocks,
        firstRowTime: selectedNode["Actual Startup Time"] ?? null,
        lastRowTime: selectedNode["Actual Total Time"] ?? null,
    };
}


function renderPlan(data) {
    const databaseRan = Boolean(data.database?.executed);

    postgresBypassed.classList.toggle("hidden", databaseRan);
    postgresExecutionContent.classList.toggle("hidden", !databaseRan);

    if (!databaseRan) {
        postgresReportDescription.textContent =
            "Redis served this response without executing PostgreSQL.";
        planScanBadge.textContent = "Bypassed";
        rawSql.textContent = "";
        rawExplain.textContent = "";
        return;
    }

    postgresReportDescription.textContent =
        "EXPLAIN ANALYZE for the database strategy used on this cache miss.";
    rawSql.textContent = data.raw_sql ?? "";
    rawExplain.textContent = JSON.stringify(data.query_plan, null, 2);

    const analysis = analyzePlan(data.query_plan);
    if (!analysis) {
        planScanBadge.textContent = "Unavailable";
        planPrimaryOperation.textContent = "Unavailable";
        planPrimaryDescription.textContent = "No PostgreSQL execution plan was returned.";
        return;
    }

    planScanBadge.textContent = analysis.operation;
    planPrimaryOperation.textContent = analysis.operation;
    planPrimaryDescription.textContent = analysis.description;
    planPlanningTime.textContent = formatMilliseconds(analysis.planningTime);
    planExecutionTime.textContent = formatMilliseconds(analysis.executionTime);
    planRowsRemoved.textContent = formatNumber(analysis.rowsRemoved);
    planSharedHit.textContent = formatNumber(analysis.sharedHitBlocks);
    planSharedRead.textContent = formatNumber(analysis.sharedReadBlocks);
    planFirstRowTime.textContent = formatMilliseconds(analysis.firstRowTime);
    planLastRowTime.textContent = formatMilliseconds(analysis.lastRowTime);
}


function renderTags(tags) {
    if (!Array.isArray(tags)) {
        return "";
    }

    return tags.slice(0, 5).map((tag) => `
        <span class="result-tag">${escapeHtml(tag)}</span>
    `).join("");
}


function createResultCard(product) {
    const article = document.createElement("article");
    article.className = "result-card";

    const isFuzzy = Number.isFinite(Number(product.fuzzy_score));
    const score = Number(isFuzzy ? product.fuzzy_score : product.rank);
    const scoreLabel = isFuzzy ? "fuzzy score" : "relevance rank";
    const scoreClass = isFuzzy ? "fuzzy-score-box" : "rank-box";
    const summary = product.headline
        ? safeHeadline(product.headline)
        : escapeHtml(product.description || "");

    article.innerHTML = `
        <div class="result-main">
            <div class="result-topline">
                ${product.brand ? `<span class="result-brand">${escapeHtml(product.brand)}</span>` : ""}
                ${product.category ? `<span class="result-category">${escapeHtml(product.category)}</span>` : ""}
                ${renderTags(product.tags)}
            </div>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="${product.headline ? "result-headline" : "result-description"}">${summary}</p>
            <div class="result-meta">
                <span>ID ${escapeHtml(product.id)}</span>
                <span>Rating: ${escapeHtml(product.rating ?? "—")}</span>
                <span>Stock: ${escapeHtml(product.stock)}</span>
            </div>
        </div>
        <div class="result-side">
            <div class="result-price">${formatPrice(product.price)}</div>
            <div class="${scoreClass}">
                <span>${scoreLabel}</span>
                <strong>${Number.isFinite(score) ? score.toFixed(6) : "—"}</strong>
            </div>
            <span class="stock-status">
                ${Number(product.stock) > 0 ? `${escapeHtml(product.stock)} in stock` : "Out of stock"}
            </span>
        </div>
    `;

    return article;
}


function appendResults(results) {
    for (const result of results) {
        resultsContainer.appendChild(createResultCard(result));
    }
    resultsVisibleCount.textContent = formatNumber(loadedResults.length);
}


function renderReport(data) {
    const cache = data.cache ?? {};
    const database = data.database ?? {};
    const metrics = data.metrics ?? {};
    const cacheHit = Boolean(cache.hit);
    const databaseRan = Boolean(database.executed);
    const fuzzy = data.strategy === "fuzzy_fallback";

    reportQuery.textContent = data.normalized_query ?? data.query ?? currentQuery;
    metricResultCount.textContent = formatNumber(data.total_count ?? data.count);
    metricApplicationTime.textContent = formatMilliseconds(metrics.application_time_ms);
    metricCacheLookup.textContent = formatMilliseconds(cache.lookup_time_ms);
    metricPeakMemory.textContent = formatMemory(metrics.peak_memory_mb);

    cacheStatusBadge.textContent = cacheHit ? "Cache hit" : "Cache miss";
    cacheStatusBadge.classList.toggle("hit", cacheHit);
    cacheStatusBadge.classList.toggle("miss", !cacheHit);
    cacheHitStatus.textContent = cacheHit ? "HIT" : "MISS";
    cacheHitDescription.textContent = cacheHit
        ? "Redis returned the cached search result."
        : "The search pipeline executed and attempted to populate Redis.";
    cacheLookupTime.textContent = formatMilliseconds(cache.lookup_time_ms);
    cacheWriteTime.textContent = formatMilliseconds(cache.write_time_ms);
    cacheTtl.textContent = formatSeconds(cache.ttl_seconds);
    cacheTtlRemaining.textContent = formatSeconds(cache.ttl_remaining_seconds);
    cacheKey.textContent = cache.key ?? "—";

    databaseStatusBadge.textContent = databaseRan ? "Executed" : "Bypassed";
    databaseStatusBadge.classList.toggle("executed", databaseRan);
    databaseStatusBadge.classList.toggle("bypassed", !databaseRan);
    databaseExecuted.textContent = yesNo(databaseRan);
    databaseExecutedDescription.textContent = databaseRan
        ? "PostgreSQL produced this result on a cache miss."
        : "Redis served this result without a database query.";
    databaseFtsAttempted.textContent = yesNo(database.fts_attempted);
    databaseFuzzyAttempted.textContent = yesNo(database.fuzzy_attempted);
    databaseExplainExecuted.textContent = yesNo(database.explain_executed);

    strategyBadge.textContent = fuzzy ? "Fuzzy fallback" : "Full-text search";
    strategyName.textContent = fuzzy ? "Trigram fallback" : "Indexed full-text";
    strategyEngine.textContent = data.engine ?? "—";
    strategyFallbackUsed.textContent = yesNo(data.fallback_used);

    timingCacheLookup.textContent = formatMilliseconds(cache.lookup_time_ms);
    timingFts.textContent = formatMilliseconds(metrics.fts_time_ms);
    timingFuzzy.textContent = formatMilliseconds(metrics.fuzzy_time_ms);
    timingCacheWrite.textContent = formatMilliseconds(cache.write_time_ms);
    timingExplain.textContent = formatMilliseconds(metrics.explain_time_ms);
    timingApplicationTotal.textContent = formatMilliseconds(metrics.application_time_ms);

    resultsDescription.textContent = cacheHit
        ? "Results returned from Redis using the cached search strategy."
        : fuzzy
            ? "Results ranked by trigram similarity after full-text search found no matches."
            : "Results ranked by indexed PostgreSQL full-text relevance.";

    byId("comparison-v5-results").textContent = formatNumber(data.total_count ?? data.count);
    byId("comparison-v5-time").textContent = formatMilliseconds(metrics.application_time_ms);
    byId("comparison-v5-db").textContent = databaseRan ? "Executed" : "Bypassed";
    byId("comparison-v5-cache").textContent = cacheHit ? "Hit" : "Miss";

    renderPlan(data);
}


async function requestSearch({ query, offset }) {
    const url = new URL(SEARCH_ENDPOINT, window.location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // The HTTP status below provides the fallback error.
    }

    if (!response.ok) {
        const detail = payload?.detail;
        throw new Error(
            typeof detail === "string"
                ? detail
                : detail
                    ? JSON.stringify(detail)
                    : `HTTP ${response.status}`,
        );
    }

    return payload;
}


async function runNewSearch(query) {
    if (isLoading) {
        return;
    }

    currentQuery = query;
    currentOffset = 0;
    loadedResults = [];
    errorState.classList.add("hidden");
    initialState.classList.add("hidden");
    searchOutput.classList.add("hidden");
    resultsContainer.innerHTML = "";
    setLoading(true);

    try {
        const data = await requestSearch({ query, offset: 0 });
        loadedResults = [...(data.results ?? [])];
        currentOffset = loadedResults.length;
        hasMore = Boolean(data.has_more);
        renderReport(data);
        appendResults(data.results ?? []);
        searchOutput.classList.remove("hidden");
        seeMoreButton.classList.toggle("hidden", !hasMore);
    } catch (error) {
        showError(error instanceof Error ? error.message : "Search failed.");
        initialState.classList.remove("hidden");
    } finally {
        setLoading(false);
    }
}


async function loadMoreResults() {
    if (isLoading || !hasMore || !currentQuery) {
        return;
    }

    setLoading(true);
    try {
        const data = await requestSearch({
            query: currentQuery,
            offset: currentOffset,
        });
        const nextResults = data.results ?? [];
        loadedResults.push(...nextResults);
        currentOffset += nextResults.length;
        hasMore = Boolean(data.has_more);
        appendResults(nextResults);
        seeMoreButton.classList.toggle("hidden", !hasMore);
    } catch (error) {
        showError(error instanceof Error ? error.message : "Could not load more results.");
    } finally {
        setLoading(false);
    }
}


searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
        runNewSearch(query);
    }
});


clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    resetSearchUI();
    initialState.classList.remove("hidden");
    searchInput.focus();
});


seeMoreButton.addEventListener("click", loadMoreResults);


document.querySelectorAll(".query-example").forEach((button) => {
    button.addEventListener("click", () => {
        const query = button.dataset.query ?? "";
        searchInput.value = query;
        runNewSearch(query);
    });
});


document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", async () => {
        const target = byId(button.dataset.copyTarget);
        if (!target) {
            return;
        }

        const oldText = button.textContent;
        try {
            await navigator.clipboard.writeText(target.textContent ?? "");
            button.textContent = "Copied";
        } catch {
            button.textContent = "Failed";
        }

        window.setTimeout(() => {
            button.textContent = oldText;
        }, 1200);
    });
});
