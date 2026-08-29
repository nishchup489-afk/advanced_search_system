import { API_URL } from "./config.js";


// ==========================================
// VERSION CONFIGURATION
// ==========================================

const VERSIONS = {
    1: {
        title: "V1 — ILIKE Search",
        label: "BASELINE SEARCH",

        description:
            "Case-insensitive substring matching using PostgreSQL ILIKE.",

        strategy:
            "ILIKE substring scan",

        endpoint:
            "/api/v1/search",

        retrieval:
            "Search multiple text columns using case-insensitive substring matching.",

        queryPreview: `WHERE
    name ILIKE '%query%'
    OR description ILIKE '%query%'
    OR brand ILIKE '%query%'
    OR category ILIKE '%query%'`,

        limitations: [
            "No stemming",
            "No relevance ranking",
            "Weak multi-word matching",
            "Expensive leading wildcard"
        ]
    }
};


// ==========================================
// VERSION
// ==========================================

const urlParams =
    new URLSearchParams(window.location.search);

const version =
    urlParams.get("v") || "1";

const config =
    VERSIONS[version] || VERSIONS[1];


// ==========================================
// ELEMENTS
// ==========================================

const searchForm =
    document.getElementById("searchForm");

const searchInput =
    document.getElementById("searchInput");

const searchButton =
    document.getElementById("searchButton");

const resultsContainer =
    document.getElementById("results");

const resultCount =
    document.getElementById("resultCount");

const executionTime =
    document.getElementById("executionTime");

const searchStrategy =
    document.getElementById("searchStrategy");

const message =
    document.getElementById("message");


const versionBadge =
    document.getElementById("versionBadge");

const versionLabel =
    document.getElementById("versionLabel");

const versionTitle =
    document.getElementById("versionTitle");

const versionDescription =
    document.getElementById("versionDescription");

const retrievalDescription =
    document.getElementById("retrievalDescription");

const queryPreview =
    document.getElementById("queryPreview");

const limitationsList =
    document.getElementById("limitationsList");

const footerVersion =
    document.getElementById("footerVersion");


const benchmarkQuery =
    document.getElementById("benchmarkQuery");

const activeBenchmarkVersion =
    document.getElementById("activeBenchmarkVersion");


const planType =
    document.getElementById("planType");

const postgresExecutionTime =
    document.getElementById("postgresExecutionTime");

const planningTime =
    document.getElementById("planningTime");

const actualRows =
    document.getElementById("actualRows");

const rowsRemoved =
    document.getElementById("rowsRemoved");

const sharedHits =
    document.getElementById("sharedHits");

const sharedReads =
    document.getElementById("sharedReads");

const peakMemory =
    document.getElementById("peakMemory");

const rawQueryPlan =
    document.getElementById("rawQueryPlan");


const exampleQueries =
    document.querySelectorAll(".example-query");


// ==========================================
// VERSION UI
// ==========================================

function renderVersion() {
    versionBadge.textContent =
        `V${version}`;

    versionLabel.textContent =
        config.label;

    versionTitle.textContent =
        config.title;

    versionDescription.textContent =
        config.description;

    searchStrategy.textContent =
        config.strategy;

    retrievalDescription.textContent =
        config.retrieval;

    queryPreview.textContent =
        config.queryPreview;

    footerVersion.textContent =
        config.title;

    activeBenchmarkVersion.textContent =
        `V${version}`;


    limitationsList.replaceChildren();

    for (const limitation of config.limitations) {
        const item =
            document.createElement("li");

        item.textContent =
            limitation;

        limitationsList.appendChild(item);
    }


    const rows =
        document.querySelectorAll(
            ".benchmark-row"
        );

    for (const row of rows) {
        row.classList.toggle(
            "active",
            row.dataset.version === version
        );
    }
}


renderVersion();


// ==========================================
// HTTP
// ==========================================

async function searchProducts(query) {
    const params =
        new URLSearchParams({
            q: query
        });

    const url =
        `${API_URL}${config.endpoint}?${params.toString()}`;

    const response =
        await fetch(url);


    if (!response.ok) {
        let errorMessage =
            `Search failed (${response.status})`;

        try {
            const errorData =
                await response.json();

            errorMessage =
                errorData.detail ??
                errorMessage;

        } catch {
            // Response was not JSON.
        }

        throw new Error(errorMessage);
    }


    return response.json();
}


// ==========================================
// SEARCH FORM
// ==========================================

async function handleSearch(event) {
    event.preventDefault();

    const query =
        searchInput.value.trim();

    if (!query) {
        return;
    }


    setLoading(true);
    hideMessage();


    try {
        const data =
            await searchProducts(query);

        renderResponse(data);

    } catch (error) {
        console.error(error);

        showMessage(
            error.message,
            "error"
        );

    } finally {
        setLoading(false);
    }
}


searchForm.addEventListener(
    "submit",
    handleSearch
);


// ==========================================
// RESPONSE
// ==========================================

function renderResponse(data) {
    renderMeta(data);

    renderResults(
        data.results ?? []
    );

    renderDiagnostics(data);

    renderBenchmark(data);
}


// ==========================================
// META
// ==========================================

function renderMeta(data) {
    const count =
        data.count ?? 0;

    resultCount.textContent =
        `${count} ${count === 1 ? "result" : "results"}`;


    const time =
        data.metrics?.execution_time_ms;

    executionTime.textContent =
        Number.isFinite(time)
            ? `${time} ms`
            : "-- ms";


    benchmarkQuery.textContent =
        `"${data.query ?? ""}"`;
}


// ==========================================
// RESULTS
// ==========================================

function renderResults(products) {
    resultsContainer.replaceChildren();


    if (products.length === 0) {
        renderEmptyResults();
        return;
    }


    for (const product of products) {
        resultsContainer.appendChild(
            createProductElement(product)
        );
    }
}


function createProductElement(product) {
    const article =
        document.createElement("article");

    article.className =
        "result-item";


    // MAIN

    const main =
        document.createElement("div");


    const header =
        document.createElement("div");

    header.className =
        "result-header";


    const title =
        document.createElement("h2");

    title.className =
        "result-title";

    title.textContent =
        product.name ?? "Unnamed product";


    const brand =
        document.createElement("span");

    brand.className =
        "result-brand";

    brand.textContent =
        product.brand ?? "Unknown";


    header.append(
        title,
        brand
    );


    const meta =
        document.createElement("div");

    meta.className =
        "result-meta";

    meta.textContent =
        product.category ?? "";


    const description =
        document.createElement("p");

    description.className =
        "result-description";

    description.textContent =
        product.description ?? "";


    main.append(
        header,
        meta,
        description
    );


    // SIDE

    const side =
        document.createElement("div");

    side.className =
        "result-side";


    const price =
        document.createElement("span");

    price.className =
        "result-price";

    price.textContent =
        formatPrice(product.price);


    const rating =
        document.createElement("span");

    rating.className =
        "result-rating";

    rating.textContent =
        `★ ${product.rating ?? "--"}`;


    const stock =
        document.createElement("span");

    stock.className =
        "result-stock";


    if (
        product.stock !== null &&
        product.stock !== undefined
    ) {
        stock.textContent =
            product.stock > 0
                ? `${product.stock} in stock`
                : "Out of stock";
    }


    side.append(
        price,
        rating,
        stock
    );


    article.append(
        main,
        side
    );


    return article;
}


function renderEmptyResults() {
    const empty =
        document.createElement("div");

    empty.className =
        "empty-state";


    const icon =
        document.createElement("div");

    icon.className =
        "empty-icon";

    icon.textContent =
        "0";


    const title =
        document.createElement("h2");

    title.textContent =
        "No products found";


    const description =
        document.createElement("p");

    description.textContent =
        "V1 could not find a substring match for this query.";


    empty.append(
        icon,
        title,
        description
    );


    resultsContainer.appendChild(
        empty
    );
}


// ==========================================
// EXPLAIN ANALYZE
// ==========================================

function renderDiagnostics(data) {
    const metrics =
        data.metrics ?? {};


    peakMemory.textContent =
        Number.isFinite(
            metrics.peak_memory_mb
        )
            ? `${metrics.peak_memory_mb} MB`
            : "-- MB";


    const report =
        normalizeExplainReport(
            data.query_plan
        );


    rawQueryPlan.textContent =
        report
            ? JSON.stringify(
                report,
                null,
                2
            )
            : "No EXPLAIN ANALYZE data returned.";


    if (!report) {
        resetDatabaseDiagnostics();
        return;
    }


    const rootPlan =
        report.Plan;


    const scanPlan =
        findScanNode(rootPlan) ??
        rootPlan;


    planType.textContent =
        scanPlan?.["Node Type"] ??
        "--";


    postgresExecutionTime.textContent =
        formatMs(
            report["Execution Time"]
        );


    planningTime.textContent =
        formatMs(
            report["Planning Time"]
        );


    actualRows.textContent =
        formatInteger(
            scanPlan?.["Actual Rows"]
        );


    rowsRemoved.textContent =
        formatInteger(
            collectMetric(
                rootPlan,
                "Rows Removed by Filter"
            )
        );


    sharedHits.textContent =
        formatInteger(
            collectMetric(
                rootPlan,
                "Shared Hit Blocks"
            )
        );


    sharedReads.textContent =
        formatInteger(
            collectMetric(
                rootPlan,
                "Shared Read Blocks"
            )
        );
}


// ==========================================
// EXPLAIN HELPERS
// ==========================================

function normalizeExplainReport(value) {
    if (!value) {
        return null;
    }


    let current =
        value;


    // Handle psycopg tuple/list wrappers such as:
    // [[[{ ... }]]]
    while (
        Array.isArray(current) &&
        current.length === 1
    ) {
        current =
            current[0];
    }


    if (typeof current === "string") {
        try {
            current =
                JSON.parse(current);

        } catch {
            return null;
        }
    }


    while (
        Array.isArray(current) &&
        current.length === 1
    ) {
        current =
            current[0];
    }


    if (
        current &&
        typeof current === "object" &&
        current.Plan
    ) {
        return current;
    }


    return null;
}


function findScanNode(plan) {
    if (!plan) {
        return null;
    }


    const nodeType =
        plan["Node Type"];


    if (
        typeof nodeType === "string" &&
        nodeType.includes("Scan")
    ) {
        return plan;
    }


    const children =
        plan.Plans ?? [];


    for (const child of children) {
        const result =
            findScanNode(child);

        if (result) {
            return result;
        }
    }


    return null;
}


function collectMetric(plan, key) {
    if (!plan) {
        return 0;
    }


    let total =
        Number(plan[key] ?? 0);


    const children =
        plan.Plans ?? [];


    for (const child of children) {
        total +=
            collectMetric(
                child,
                key
            );
    }


    return total;
}


function resetDatabaseDiagnostics() {
    planType.textContent =
        "--";

    postgresExecutionTime.textContent =
        "-- ms";

    planningTime.textContent =
        "-- ms";

    actualRows.textContent =
        "--";

    rowsRemoved.textContent =
        "--";

    sharedHits.textContent =
        "--";

    sharedReads.textContent =
        "--";
}


// ==========================================
// BENCHMARK
// ==========================================

function renderBenchmark(data) {
    const benchmark =
        document.getElementById(
            `benchmarkV${version}`
        );

    if (!benchmark) {
        return;
    }


    const execution =
        data.metrics?.execution_time_ms;


    benchmark.textContent =
        Number.isFinite(execution)
            ? `${execution} ms`
            : "-- ms";
}


// ==========================================
// EXAMPLE QUERIES
// ==========================================

for (const button of exampleQueries) {
    button.addEventListener(
        "click",
        () => {
            searchInput.value =
                button.dataset.query ?? "";

            searchForm.requestSubmit();
        }
    );
}


// ==========================================
// UI HELPERS
// ==========================================

function setLoading(isLoading) {
    searchButton.disabled =
        isLoading;

    searchButton.textContent =
        isLoading
            ? "Searching..."
            : "Search";
}


function showMessage(
    text,
    type = ""
) {
    message.hidden =
        false;

    message.textContent =
        text;

    message.className =
        `message ${type}`.trim();
}


function hideMessage() {
    message.hidden =
        true;

    message.textContent =
        "";

    message.className =
        "message";
}


// ==========================================
// FORMATTING
// ==========================================

function formatPrice(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }


    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    ).format(number);
}


function formatMs(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "-- ms";
    }


    return `${number.toFixed(3)} ms`;
}


function formatInteger(value) {
    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }


    return Math.round(
        number
    ).toLocaleString();
}