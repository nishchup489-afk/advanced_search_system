"use strict";

import { API_URL } from "../scripts/config.js";


/* ============================================================
   CONFIG
============================================================ */

const SEARCH_ENDPOINT = `${API_URL}/api/v2/search`;

const PAGE_SIZE = 10;


/* ============================================================
   DOM
============================================================ */

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const clearSearchButton = document.getElementById(
    "clear-search-button",
);

const initialState = document.getElementById("initial-state");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const searchOutput = document.getElementById("search-output");

const reportQuery = document.getElementById("report-query");

const metricResultCount = document.getElementById(
    "metric-result-count",
);

const metricApplicationTime = document.getElementById(
    "metric-application-time",
);

const metricDbExecutionTime = document.getElementById(
    "metric-db-execution-time",
);

const metricPeakMemory = document.getElementById(
    "metric-peak-memory",
);

const planScanBadge = document.getElementById(
    "plan-scan-badge",
);

const planPrimaryOperation = document.getElementById(
    "plan-primary-operation",
);

const planPrimaryDescription = document.getElementById(
    "plan-primary-description",
);

const planPlanningTime = document.getElementById(
    "plan-planning-time",
);

const planExecutionTime = document.getElementById(
    "plan-execution-time",
);

const planRowsRemoved = document.getElementById(
    "plan-rows-removed",
);

const planSharedHit = document.getElementById(
    "plan-shared-hit",
);

const planFirstRowTime = document.getElementById(
    "plan-first-row-time",
);

const planLastRowTime = document.getElementById(
    "plan-last-row-time",
);

const rawSql = document.getElementById("raw-sql");
const rawExplain = document.getElementById("raw-explain");

const resultsContainer = document.getElementById(
    "results-container",
);

const resultsVisibleCount = document.getElementById(
    "results-visible-count",
);

const seeMoreButton = document.getElementById(
    "see-more-button",
);


/* ============================================================
   STATE
============================================================ */

let currentQuery = "";
let currentOffset = 0;
let loadedResults = [];
let hasMore = false;
let isLoading = false;


/* ============================================================
   HELPERS
============================================================ */

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return new Intl.NumberFormat().format(number);
}


function formatMilliseconds(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return `${number.toFixed(3)} ms`;
}


function formatMemory(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return `${number.toFixed(3)} MB`;
}


function formatPrice(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD",
        },
    ).format(number);
}


function setLoading(loading) {
    isLoading = loading;

    searchButton.disabled = loading;
    seeMoreButton.disabled = loading;

    loadingState.classList.toggle(
        "hidden",
        !loading,
    );
}


function showError(message) {
    errorMessage.textContent = message;

    errorState.classList.remove("hidden");
}


function hideError() {
    errorState.classList.add("hidden");
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

    /*
     PostgreSQL EXPLAIN FORMAT JSON normally looks like:

     [
         {
             "Plan": {...},
             "Planning Time": ...,
             "Execution Time": ...
         }
     ]
    */

    if (Array.isArray(queryPlan)) {
        return queryPlan[0] ?? null;
    }

    return queryPlan;
}


/* ============================================================
   PLAN WALKER
============================================================ */

function walkPlan(node, callback) {
    if (!node) {
        return;
    }

    callback(node);

    const children = node.Plans;

    if (!Array.isArray(children)) {
        return;
    }

    for (const child of children) {
        walkPlan(child, callback);
    }
}


function analyzePlan(queryPlan) {
    const root = getPlanRoot(queryPlan);

    if (!root) {
        return null;
    }

    const mainPlan = root.Plan ?? null;

    let rowsRemoved = 0;
    let sharedHitBlocks = 0;

    let sequentialScan = null;
    let bitmapHeapScan = null;
    let indexScan = null;

    walkPlan(
        mainPlan,
        (node) => {
            rowsRemoved += Number(
                node["Rows Removed by Filter"] ?? 0,
            );

            sharedHitBlocks += Number(
                node["Shared Hit Blocks"] ?? 0,
            );

            const nodeType = node["Node Type"];

            if (
                nodeType === "Seq Scan" &&
                sequentialScan === null
            ) {
                sequentialScan = node;
            }

            if (
                nodeType === "Bitmap Heap Scan" &&
                bitmapHeapScan === null
            ) {
                bitmapHeapScan = node;
            }

            if (
                (
                    nodeType === "Index Scan" ||
                    nodeType === "Index Only Scan"
                ) &&
                indexScan === null
            ) {
                indexScan = node;
            }
        },
    );

    let selectedNode = mainPlan;

    let operation = mainPlan?.["Node Type"] ?? "Unknown";

    let description =
        "PostgreSQL executed the query using the reported plan.";

    if (sequentialScan) {
        selectedNode = sequentialScan;
        operation = "Sequential Scan";

        description =
            "PostgreSQL inspected the products table row by row. " +
            "For V2, the full-text search vector is constructed " +
            "during query execution because no dedicated GIN " +
            "full-text index exists yet.";
    } else if (bitmapHeapScan) {
        selectedNode = bitmapHeapScan;
        operation = "Bitmap Heap Scan";

        description =
            "PostgreSQL used a bitmap to locate candidate heap " +
            "pages before retrieving matching rows.";
    } else if (indexScan) {
        selectedNode = indexScan;
        operation = indexScan["Node Type"];

        description =
            "PostgreSQL used an index-based access path instead " +
            "of scanning every table row.";
    }

    return {
        operation,
        description,

        planningTime:
            root["Planning Time"] ?? null,

        executionTime:
            root["Execution Time"] ?? null,

        rowsRemoved,

        sharedHitBlocks,

        firstRowTime:
            selectedNode?.["Actual Startup Time"] ?? null,

        lastRowTime:
            selectedNode?.["Actual Total Time"] ?? null,

        nodeType:
            selectedNode?.["Node Type"] ?? null,
    };
}


/* ============================================================
   PLAN RENDERING
============================================================ */

function renderPlan(queryPlan) {
    const analysis = analyzePlan(queryPlan);

    rawExplain.textContent = JSON.stringify(
        queryPlan,
        null,
        2,
    );

    if (!analysis) {
        planPrimaryOperation.textContent = "Unavailable";

        planPrimaryDescription.textContent =
            "No PostgreSQL execution plan was returned.";

        return;
    }

    planPrimaryOperation.textContent =
        analysis.operation;

    planPrimaryDescription.textContent =
        analysis.description;

    planPlanningTime.textContent =
        formatMilliseconds(
            analysis.planningTime,
        );

    planExecutionTime.textContent =
        formatMilliseconds(
            analysis.executionTime,
        );

    metricDbExecutionTime.textContent =
        formatMilliseconds(
            analysis.executionTime,
        );

    planRowsRemoved.textContent =
        formatNumber(
            analysis.rowsRemoved,
        );

    planSharedHit.textContent =
        formatNumber(
            analysis.sharedHitBlocks,
        );

    planFirstRowTime.textContent =
        formatMilliseconds(
            analysis.firstRowTime,
        );

    planLastRowTime.textContent =
        formatMilliseconds(
            analysis.lastRowTime,
        );

    if (analysis.nodeType === "Seq Scan") {
        planScanBadge.textContent =
            "Sequential scan";
    } else {
        planScanBadge.textContent =
            analysis.nodeType ?? "Execution plan";
    }
}


/* ============================================================
   RESULTS
============================================================ */

function renderTags(tags) {
    if (!Array.isArray(tags)) {
        return "";
    }

    return tags
        .slice(0, 5)
        .map(
            (tag) => `
                <span class="result-tag">
                    ${escapeHtml(tag)}
                </span>
            `,
        )
        .join("");
}


function createResultCard(product) {
    const article = document.createElement("article");

    article.className = "result-card";

    /*
     headline intentionally contains <mark> generated by PostgreSQL.

     Do NOT run the headline through escapeHtml(), otherwise the
     highlight tags become visible text.

     The backend controls StartSel / StopSel, not the user.
    */

    const headline =
        product.headline ||
        escapeHtml(product.description || "");

    const rank = Number(product.rank);

    article.innerHTML = `
        <div class="result-main">

            <div class="result-topline">

                ${
                    product.brand
                        ? `
                            <span class="result-brand">
                                ${escapeHtml(product.brand)}
                            </span>
                        `
                        : ""
                }

                ${
                    product.category
                        ? `
                            <span class="result-category">
                                ${escapeHtml(product.category)}
                            </span>
                        `
                        : ""
                }

                ${renderTags(product.tags)}

            </div>

            <h3>
                ${escapeHtml(product.name)}
            </h3>

            <p class="result-headline">
                ${headline}
            </p>

            <div class="result-meta">

                <span>
                    ID ${escapeHtml(product.id)}
                </span>

                <span>
                    Rating:
                    ${escapeHtml(product.rating ?? "—")}
                </span>

                <span>
                    Stock:
                    ${escapeHtml(product.stock)}
                </span>

            </div>

        </div>


        <div class="result-side">

            <div class="result-price">
                ${formatPrice(product.price)}
            </div>

            <div class="rank-box">

                <span>
                    relevance rank
                </span>

                <strong>
                    ${
                        Number.isFinite(rank)
                            ? rank.toFixed(6)
                            : "—"
                    }
                </strong>

            </div>

            <span class="stock-status">
                ${
                    Number(product.stock) > 0
                        ? `${escapeHtml(product.stock)} in stock`
                        : "Out of stock"
                }
            </span>

        </div>
    `;

    return article;
}


function appendResults(results) {
    for (const result of results) {
        resultsContainer.appendChild(
            createResultCard(result),
        );
    }

    resultsVisibleCount.textContent =
        formatNumber(
            loadedResults.length,
        );
}


/* ============================================================
   REPORT
============================================================ */

function renderReport(data) {
    reportQuery.textContent =
        data.query ?? currentQuery;

    metricResultCount.textContent =
        data.total_count !== undefined
            ? formatNumber(data.total_count)
            : formatNumber(data.count);

    metricApplicationTime.textContent =
        formatMilliseconds(
            data.metrics?.application_time_ms,
        );

    metricPeakMemory.textContent =
        formatMemory(
            data.metrics?.peak_memory_mb,
        );

    rawSql.textContent =
        data.raw_sql ?? "";

    renderPlan(
        data.query_plan,
    );


    /* V2 comparison row */

    document.getElementById(
        "comparison-v2-results",
    ).textContent =
        data.total_count !== undefined
            ? formatNumber(data.total_count)
            : formatNumber(data.count);

    document.getElementById(
        "comparison-v2-app-time",
    ).textContent =
        formatMilliseconds(
            data.metrics?.application_time_ms,
        );

    document.getElementById(
        "comparison-v2-db-time",
    ).textContent =
        formatMilliseconds(
            getPlanRoot(data.query_plan)?.[
                "Execution Time"
            ],
        );

    document.getElementById(
        "comparison-v2-memory",
    ).textContent =
        formatMemory(
            data.metrics?.peak_memory_mb,
        );

    document.getElementById(
        "comparison-v2-scan",
    ).textContent =
        analyzePlan(data.query_plan)?.operation ?? "—";
}


/* ============================================================
   API
============================================================ */

async function requestSearch({
    query,
    offset,
}) {
    const url = new URL(
        SEARCH_ENDPOINT,
        window.location.origin,
    );

    url.searchParams.set(
        "q",
        query,
    );

    url.searchParams.set(
        "limit",
        String(PAGE_SIZE),
    );

    url.searchParams.set(
        "offset",
        String(offset),
    );

    const response = await fetch(
        url,
        {
            method: "GET",

            headers: {
                Accept: "application/json",
            },
        },
    );

    let payload = null;

    try {
        payload = await response.json();
    } catch {
        // handled below
    }

    if (!response.ok) {
        const detail =
            payload?.detail ||
            `HTTP ${response.status}`;

        throw new Error(detail);
    }

    return payload;
}


/* ============================================================
   SEARCH
============================================================ */

async function runNewSearch(query) {
    if (isLoading) {
        return;
    }

    currentQuery = query;
    currentOffset = 0;
    loadedResults = [];

    hideError();

    initialState.classList.add("hidden");
    searchOutput.classList.add("hidden");

    resultsContainer.innerHTML = "";

    setLoading(true);

    try {
        const data = await requestSearch({
            query,
            offset: 0,
        });

        loadedResults = [
            ...(data.results ?? []),
        ];

        currentOffset =
            loadedResults.length;

        hasMore =
            Boolean(data.has_more);

        renderReport(data);
        appendResults(data.results ?? []);

        searchOutput.classList.remove("hidden");

        seeMoreButton.classList.toggle(
            "hidden",
            !hasMore,
        );

    } catch (error) {
        showError(
            error instanceof Error
                ? error.message
                : "Search failed.",
        );

        initialState.classList.remove("hidden");

    } finally {
        setLoading(false);
    }
}


async function loadMoreResults() {
    if (
        isLoading ||
        !hasMore ||
        !currentQuery
    ) {
        return;
    }

    setLoading(true);

    try {
        const data = await requestSearch({
            query: currentQuery,
            offset: currentOffset,
        });

        const nextResults =
            data.results ?? [];

        loadedResults.push(
            ...nextResults,
        );

        currentOffset +=
            nextResults.length;

        hasMore =
            Boolean(data.has_more);

        appendResults(
            nextResults,
        );

        seeMoreButton.classList.toggle(
            "hidden",
            !hasMore,
        );

    } catch (error) {
        showError(
            error instanceof Error
                ? error.message
                : "Could not load more results.",
        );

    } finally {
        setLoading(false);
    }
}


/* ============================================================
   EVENTS
============================================================ */

searchForm.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();

        const query =
            searchInput.value.trim();

        if (!query) {
            return;
        }

        runNewSearch(query);
    },
);


clearSearchButton.addEventListener(
    "click",
    () => {
        searchInput.value = "";

        resetSearchUI();

        initialState.classList.remove("hidden");

        searchInput.focus();
    },
);


seeMoreButton.addEventListener(
    "click",
    loadMoreResults,
);


document
    .querySelectorAll(".query-example")
    .forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    const query =
                        button.dataset.query ?? "";

                    searchInput.value = query;

                    runNewSearch(query);
                },
            );
        },
    );


document
    .querySelectorAll(".copy-button")
    .forEach(
        (button) => {
            button.addEventListener(
                "click",
                async () => {
                    const targetId =
                        button.dataset.copyTarget;

                    if (!targetId) {
                        return;
                    }

                    const target =
                        document.getElementById(targetId);

                    if (!target) {
                        return;
                    }

                    try {
                        await navigator.clipboard.writeText(
                            target.textContent ?? "",
                        );

                        const oldText =
                            button.textContent;

                        button.textContent =
                            "Copied";

                        window.setTimeout(
                            () => {
                                button.textContent =
                                    oldText;
                            },
                            1200,
                        );

                    } catch {
                        button.textContent =
                            "Failed";
                    }
                },
            );
        },
    );
