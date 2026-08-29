import { API_URL } from "../scripts/config.js";


// =========================================================
// CONFIG
// =========================================================

const SEARCH_ENDPOINT = `${API_URL}/api/v1/search`;

const INITIAL_RESULTS_LIMIT = 10;


// =========================================================
// DOM — SEARCH
// =========================================================

const searchForm =
    document.getElementById("searchForm");

const searchInput =
    document.getElementById("searchInput");

const searchButton =
    document.getElementById("searchButton");

const activeQuery =
    document.getElementById("activeQuery");

const resultCount =
    document.getElementById("resultCount");

const message =
    document.getElementById("message");

const exampleQueries =
    document.querySelectorAll(".example-query");


// =========================================================
// DOM — APPLICATION METRICS
// =========================================================

const applicationTime =
    document.getElementById("applicationTime");

const currentMemory =
    document.getElementById("currentMemory");

const peakMemory =
    document.getElementById("peakMemory");


// =========================================================
// DOM — POSTGRESQL METRICS
// =========================================================

const planHumanTitle =
    document.getElementById("planHumanTitle");

const planHumanDescription =
    document.getElementById("planHumanDescription");

const planType =
    document.getElementById("planType");

const planTypeExplanation =
    document.getElementById("planTypeExplanation");

const postgresExecutionTime =
    document.getElementById("postgresExecutionTime");

const planningTime =
    document.getElementById("planningTime");

const firstRowTime =
    document.getElementById("firstRowTime");

const lastRowTime =
    document.getElementById("lastRowTime");

const actualRows =
    document.getElementById("actualRows");

const rowsRemoved =
    document.getElementById("rowsRemoved");

const rowsRemovedExplanation =
    document.getElementById("rowsRemovedExplanation");

const sharedHits =
    document.getElementById("sharedHits");

const sharedReads =
    document.getElementById("sharedReads");

const executionStory =
    document.getElementById("executionStory");


// =========================================================
// DOM — RAW DATA
// =========================================================

const rawQuery =
    document.getElementById("rawQuery");

const rawQueryPlan =
    document.getElementById("rawQueryPlan");


// =========================================================
// DOM — BENCHMARK
// =========================================================

const benchmarkQuery =
    document.getElementById("benchmarkQuery");

const benchmarkV1App =
    document.getElementById("benchmarkV1App");

const benchmarkV1Database =
    document.getElementById("benchmarkV1Database");

const benchmarkV1Plan =
    document.getElementById("benchmarkV1Plan");


// =========================================================
// DOM — RESULTS
// =========================================================

const resultsContainer =
    document.getElementById("results");

const resultsSummary =
    document.getElementById("resultsSummary");

const seeMoreContainer =
    document.getElementById("seeMoreContainer");

const seeMoreButton =
    document.getElementById("seeMoreButton");

const seeMoreStatus =
    document.getElementById("seeMoreStatus");


// =========================================================
// STATE
// =========================================================

let currentResults = [];

let visibleResultCount =
    INITIAL_RESULTS_LIMIT;


// =========================================================
// API
// =========================================================

async function searchProducts(query) {
    const params =
        new URLSearchParams({
            q: query
        });

    const response =
        await fetch(
            `${SEARCH_ENDPOINT}?${params.toString()}`
        );


    if (!response.ok) {
        let errorMessage =
            `Search failed (${response.status})`;

        try {
            const errorData =
                await response.json();

            if (errorData.detail) {
                errorMessage =
                    typeof errorData.detail === "string"
                        ? errorData.detail
                        : JSON.stringify(errorData.detail);
            }

        } catch {
            // Response was not JSON.
        }

        throw new Error(errorMessage);
    }


    return response.json();
}


// =========================================================
// SEARCH SUBMIT
// =========================================================

async function handleSearch(event) {
    event.preventDefault();


    const query =
        searchInput.value.trim();


    if (!query) {
        showMessage(
            "Enter a search query.",
            "error"
        );

        return;
    }


    setLoading(true);

    hideMessage();

    resetReport();


    try {
        const data =
            await searchProducts(query);


        currentResults =
            Array.isArray(data.results)
                ? data.results
                : [];


        visibleResultCount =
            INITIAL_RESULTS_LIMIT;


        renderSearch(
            data
        );

    } catch (error) {
        console.error(error);

        showMessage(
            error.message ||
            "Something went wrong.",
            "error"
        );

        renderSearchError();

    } finally {
        setLoading(false);
    }
}


searchForm.addEventListener(
    "submit",
    handleSearch
);


// =========================================================
// EXAMPLE QUERIES
// =========================================================

for (const button of exampleQueries) {
    button.addEventListener(
        "click",
        () => {
            const query =
                button.dataset.query ?? "";

            searchInput.value =
                query;

            searchForm.requestSubmit();
        }
    );
}


// =========================================================
// MAIN RESPONSE RENDERER
// =========================================================

function renderSearch(data) {
    renderSearchStatus(data);

    renderApplicationMetrics(data);

    renderPostgresReport(data);

    renderBenchmark(data);

    renderResults();

    renderRawResponse(data);
}


// =========================================================
// SEARCH STATUS
// =========================================================

function renderSearchStatus(data) {
    const query =
        data.query ?? "";

    const count =
        Number(data.count ?? 0);


    activeQuery.textContent =
        query
            ? `"${query}"`
            : "none";


    resultCount.textContent =
        Number.isFinite(count)
            ? count.toLocaleString()
            : "0";


    benchmarkQuery.textContent =
        query
            ? `"${query}"`
            : "--";
}


// =========================================================
// APPLICATION METRICS
// =========================================================

function renderApplicationMetrics(data) {
    const metrics =
        data.metrics ?? {};


    applicationTime.textContent =
        formatMilliseconds(
            metrics.execution_time_ms
        );


    currentMemory.textContent =
        formatMemory(
            metrics.current_memory_mb
        );


    peakMemory.textContent =
        formatMemory(
            metrics.peak_memory_mb
        );
}


// =========================================================
// POSTGRESQL REPORT
// =========================================================

function renderPostgresReport(data) {
    const report =
        normalizeQueryPlan(
            data.query_plan
        );


    if (!report) {
        renderMissingQueryPlan();
        return;
    }


    const rootPlan =
        report.Plan ?? null;


    const scanNode =
        findScanNode(rootPlan) ??
        rootPlan;


    if (!scanNode) {
        renderMissingQueryPlan();
        return;
    }


    // -----------------------------------------------------
    // EXTRACT VALUES
    // -----------------------------------------------------

    const rawNodeType =
        scanNode["Node Type"] ?? "Unknown";


    const humanNodeType =
        humanizePlanType(
            rawNodeType
        );


    const dbExecution =
        toNumber(
            report["Execution Time"]
        );


    const dbPlanning =
        toNumber(
            report["Planning Time"]
        );


    const startupTime =
        toNumber(
            scanNode["Actual Startup Time"]
        );


    const totalTime =
        toNumber(
            scanNode["Actual Total Time"]
        );


    const returnedRows =
        toNumber(
            scanNode["Actual Rows"]
        );


    const removedRows =
        toNumber(
            scanNode["Rows Removed by Filter"]
        ) ?? 0;


    /*
        Use the scan node's buffer values directly.

        Do NOT recursively sum parent + child buffers.
        Parent plan nodes can already contain cumulative
        buffer information, which could double-count values.
    */

    const hitBlocks =
        toNumber(
            scanNode["Shared Hit Blocks"]
        ) ?? 0;


    const readBlocks =
        toNumber(
            scanNode["Shared Read Blocks"]
        ) ?? 0;


    // -----------------------------------------------------
    // UI VALUES
    // -----------------------------------------------------

    planType.textContent =
        humanNodeType;


    postgresExecutionTime.textContent =
        formatMilliseconds(
            dbExecution
        );


    planningTime.textContent =
        formatMilliseconds(
            dbPlanning
        );


    firstRowTime.textContent =
        formatMilliseconds(
            startupTime
        );


    lastRowTime.textContent =
        formatMilliseconds(
            totalTime
        );


    actualRows.textContent =
        formatInteger(
            returnedRows
        );


    rowsRemoved.textContent =
        formatInteger(
            removedRows
        );


    sharedHits.textContent =
        formatInteger(
            hitBlocks
        );


    sharedReads.textContent =
        formatInteger(
            readBlocks
        );


    // -----------------------------------------------------
    // HUMAN EXPLANATION
    // -----------------------------------------------------

    const explanation =
        buildPlanExplanation({
            rawNodeType,
            humanNodeType,
            returnedRows,
            removedRows,
            hitBlocks,
            readBlocks,
            startupTime,
            totalTime,
            dbExecution,
            dbPlanning
        });


    planHumanTitle.textContent =
        explanation.title;


    planHumanDescription.textContent =
        explanation.description;


    planTypeExplanation.textContent =
        explanation.strategy;


    rowsRemovedExplanation.textContent =
        explanation.filter;


    executionStory.textContent =
        explanation.story;
}


// =========================================================
// HUMAN PLAN EXPLANATION
// =========================================================

function buildPlanExplanation({
    rawNodeType,
    humanNodeType,
    returnedRows,
    removedRows,
    hitBlocks,
    readBlocks,
    startupTime,
    totalTime,
    dbExecution,
    dbPlanning
}) {

    let title =
        `PostgreSQL used a ${humanNodeType}.`;


    let strategy =
        `PostgreSQL used ${humanNodeType} to retrieve matching rows.`;



    // -----------------------------------------------------
    // SEQUENTIAL SCAN
    // -----------------------------------------------------

    if (rawNodeType === "Seq Scan") {
        title =
            "PostgreSQL searched by scanning product rows sequentially.";

        strategy =
            "A Sequential Scan means PostgreSQL read table data and tested rows against the ILIKE conditions instead of locating matches through a search index.";
    }


    // -----------------------------------------------------
    // INDEX SCAN
    // -----------------------------------------------------

    else if (rawNodeType === "Index Scan") {
        title =
            "PostgreSQL located rows through an index.";

        strategy =
            "An Index Scan means PostgreSQL used an index to locate candidate rows instead of scanning the entire table sequentially.";
    }


    // -----------------------------------------------------
    // INDEX ONLY SCAN
    // -----------------------------------------------------

    else if (rawNodeType === "Index Only Scan") {
        title =
            "PostgreSQL answered the search primarily from an index.";

        strategy =
            "An Index Only Scan can retrieve required values directly from the index when PostgreSQL does not need to visit the table for every result.";
    }


    // -----------------------------------------------------
    // BITMAP INDEX SCAN
    // -----------------------------------------------------

    else if (rawNodeType === "Bitmap Index Scan") {
        title =
            "PostgreSQL used an index to build a map of matching rows.";

        strategy =
            "A Bitmap Index Scan identifies matching row locations through an index before PostgreSQL retrieves the corresponding table pages.";
    }


    // -----------------------------------------------------
    // BITMAP HEAP SCAN
    // -----------------------------------------------------

    else if (rawNodeType === "Bitmap Heap Scan") {
        title =
            "PostgreSQL retrieved table pages identified through a bitmap.";

        strategy =
            "A Bitmap Heap Scan usually follows an index operation and retrieves table pages containing candidate matches.";
    }



    const filter =
        removedRows > 0
            ? `${formatInteger(removedRows)} rows were inspected by this scan but rejected because they did not satisfy the search filter.`
            : "This scan reported no rows removed by its filter.";



    let bufferSentence;


    if (
        hitBlocks === 0 &&
        readBlocks === 0
    ) {
        bufferSentence =
            "This scan reported no shared buffer hits or reads.";

    } else if (
        hitBlocks > 0 &&
        readBlocks === 0
    ) {
        bufferSentence =
            `${formatInteger(hitBlocks)} database pages were already available in PostgreSQL's shared buffer cache, and this scan reported no shared reads.`;

    } else if (
        hitBlocks === 0 &&
        readBlocks > 0
    ) {
        bufferSentence =
            `${formatInteger(readBlocks)} database pages had to be read into PostgreSQL's shared buffers.`;

    } else {
        bufferSentence =
            `${formatInteger(hitBlocks)} database pages were already cached, while ${formatInteger(readBlocks)} pages had to be read into PostgreSQL's shared buffers.`;
    }



    const firstRowSentence =
        startupTime !== null
            ? `The scan produced its first row after about ${formatMilliseconds(startupTime)}.`
            : "";


    const finishedSentence =
        totalTime !== null
            ? `The scan node finished after about ${formatMilliseconds(totalTime)}.`
            : "";


    const executionSentence =
        dbExecution !== null
            ? `PostgreSQL reported ${formatMilliseconds(dbExecution)} of total query execution time`
            : "PostgreSQL did not report an execution time";


    const planningSentence =
        dbPlanning !== null
            ? `and ${formatMilliseconds(dbPlanning)} of planning time.`
            : ".";


    const returnedSentence =
        returnedRows !== null
            ? `The inspected scan node returned ${formatInteger(returnedRows)} row${returnedRows === 1 ? "" : "s"}.`
            : "";


    const story = [
        strategy,
        returnedSentence,
        filter,
        bufferSentence,
        firstRowSentence,
        finishedSentence,
        `${executionSentence} ${planningSentence}`
    ]
        .filter(Boolean)
        .join(" ");


    return {
        title,
        strategy,
        filter,
        description:
            `${filter} ${bufferSentence}`,
        story
    };
}


// =========================================================
// PLAN HELPERS
// =========================================================

function normalizeQueryPlan(value) {
    if (!value) {
        return null;
    }


    let current =
        value;


    /*
        Normally backend already returns:

        {
            "Plan": {...},
            "Planning Time": ...,
            "Execution Time": ...
        }

        These loops make the frontend tolerant of extra
        single-item wrappers.
    */

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


// =========================================================
// FIND THE REAL SCAN NODE
// =========================================================

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
        /*
            If this is a Bitmap Heap Scan with a nested
            Bitmap Index Scan, the heap scan is generally
            the more useful user-facing retrieval node.
        */

        return plan;
    }


    const childPlans =
        plan.Plans ?? [];


    for (const child of childPlans) {
        const result =
            findScanNode(child);

        if (result) {
            return result;
        }
    }


    return null;
}


// =========================================================
// PLAN NAME TRANSLATION
// =========================================================

function humanizePlanType(type) {
    const names = {
        "Seq Scan":
            "Sequential Scan",

        "Index Scan":
            "Index Scan",

        "Index Only Scan":
            "Index-Only Scan",

        "Bitmap Index Scan":
            "Bitmap Index Scan",

        "Bitmap Heap Scan":
            "Bitmap Heap Scan",

        "Tid Scan":
            "Tuple ID Scan",

        "Subquery Scan":
            "Subquery Scan",

        "Function Scan":
            "Function Scan",

        "Values Scan":
            "Values Scan"
    };


    return names[type] ?? type ?? "Unknown";
}


// =========================================================
// MISSING EXPLAIN
// =========================================================

function renderMissingQueryPlan() {
    planHumanTitle.textContent =
        "No PostgreSQL execution report was returned.";


    planHumanDescription.textContent =
        "The search completed, but SearchLab could not read a structured EXPLAIN ANALYZE plan.";


    planType.textContent =
        "--";


    planTypeExplanation.textContent =
        "No scan strategy available.";


    postgresExecutionTime.textContent =
        "-- ms";


    planningTime.textContent =
        "-- ms";


    firstRowTime.textContent =
        "-- ms";


    lastRowTime.textContent =
        "-- ms";


    actualRows.textContent =
        "--";


    rowsRemoved.textContent =
        "--";


    rowsRemovedExplanation.textContent =
        "No filter statistics available.";


    sharedHits.textContent =
        "--";


    sharedReads.textContent =
        "--";


    executionStory.textContent =
        "No structured PostgreSQL execution data was available for this search.";
}


// =========================================================
// RAW RESPONSE
// =========================================================

function renderRawResponse(data) {
    /*
        This shows the exact API response your frontend received.

        If you only want PostgreSQL's query_plan later,
        replace `data` below with `data.query_plan`.
    */

    rawQueryPlan.textContent =
        JSON.stringify(
            data,
            null,
            2
        );
}


// =========================================================
// BENCHMARK
// =========================================================

function renderBenchmark(data) {
    const metrics =
        data.metrics ?? {};


    benchmarkV1App.textContent =
        formatMilliseconds(
            metrics.execution_time_ms
        );


    const report =
        normalizeQueryPlan(
            data.query_plan
        );


    if (!report) {
        benchmarkV1Database.textContent =
            "-- ms";

        benchmarkV1Plan.textContent =
            "--";

        return;
    }


    benchmarkV1Database.textContent =
        formatMilliseconds(
            report["Execution Time"]
        );


    const scanNode =
        findScanNode(
            report.Plan
        );


    benchmarkV1Plan.textContent =
        scanNode
            ? humanizePlanType(
                scanNode["Node Type"]
            )
            : "--";
}


// =========================================================
// RESULTS
// =========================================================

function renderResults() {
    resultsContainer.replaceChildren();


    if (currentResults.length === 0) {
        renderEmptyResults();

        seeMoreContainer.hidden =
            true;

        resultsSummary.textContent =
            "No matching products were returned.";

        return;
    }


    const visibleResults =
        currentResults.slice(
            0,
            visibleResultCount
        );


    for (const product of visibleResults) {
        resultsContainer.appendChild(
            createProductElement(product)
        );
    }


    updateResultsSummary(
        visibleResults.length,
        currentResults.length
    );


    updateSeeMore(
        visibleResults.length,
        currentResults.length
    );
}


// =========================================================
// PRODUCT CARD
// =========================================================

function createProductElement(product) {
    const article =
        document.createElement("article");

    article.className =
        "result-item";


    // -----------------------------------------------------
    // MAIN CONTENT
    // -----------------------------------------------------

    const main =
        document.createElement("div");


    const header =
        document.createElement("div");

    header.className =
        "result-header";


    const title =
        document.createElement("h3");

    title.className =
        "result-title";

    title.textContent =
        product.name ??
        "Unnamed product";


    const brand =
        document.createElement("span");

    brand.className =
        "result-brand";

    brand.textContent =
        product.brand ??
        "Unknown brand";


    header.append(
        title,
        brand
    );


    const meta =
        document.createElement("div");

    meta.className =
        "result-meta";

    meta.textContent =
        product.category ??
        "Uncategorized";


    const description =
        document.createElement("p");

    description.className =
        "result-description";

    description.textContent =
        product.description ??
        "No description available.";


    main.append(
        header,
        meta,
        description
    );


    // -----------------------------------------------------
    // SIDE METRICS
    // -----------------------------------------------------

    const side =
        document.createElement("div");

    side.className =
        "result-side";


    const price =
        document.createElement("span");

    price.className =
        "result-price";

    price.textContent =
        formatPrice(
            product.price
        );


    const rating =
        document.createElement("span");

    rating.className =
        "result-rating";

    rating.textContent =
        product.rating !== null &&
        product.rating !== undefined
            ? `★ ${product.rating}`
            : "★ --";


    const stock =
        document.createElement("span");

    stock.className =
        "result-stock";


    if (
        product.stock === null ||
        product.stock === undefined
    ) {
        stock.textContent =
            "Stock unknown";

    } else if (
        Number(product.stock) > 0
    ) {
        stock.textContent =
            `${Number(product.stock).toLocaleString()} in stock`;

    } else {
        stock.textContent =
            "Out of stock";
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


// =========================================================
// EMPTY RESULTS
// =========================================================

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
        document.createElement("h3");

    title.textContent =
        "No matching products";


    const description =
        document.createElement("p");

    description.textContent =
        "V1 could not find a matching contiguous substring. The database report above still shows the work PostgreSQL performed.";


    empty.append(
        icon,
        title,
        description
    );


    resultsContainer.appendChild(
        empty
    );
}


// =========================================================
// SEE MORE
// =========================================================

seeMoreButton.addEventListener(
    "click",
    () => {
        visibleResultCount +=
            INITIAL_RESULTS_LIMIT;

        renderResults();
    }
);


function updateSeeMore(
    visible,
    total
) {
    if (visible >= total) {
        seeMoreContainer.hidden =
            true;

        return;
    }


    seeMoreContainer.hidden =
        false;


    const remaining =
        total - visible;


    seeMoreButton.textContent =
        `See ${Math.min(
            INITIAL_RESULTS_LIMIT,
            remaining
        )} more`;


    seeMoreStatus.textContent =
        `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} results`;
}


function updateResultsSummary(
    visible,
    total
) {
    if (visible === total) {
        resultsSummary.textContent =
            `Showing all ${total.toLocaleString()} returned results.`;

        return;
    }


    resultsSummary.textContent =
        `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} returned results.`;
}


// =========================================================
// RESET REPORT
// =========================================================

function resetReport() {
    applicationTime.textContent =
        "-- ms";

    currentMemory.textContent =
        "-- MB";

    peakMemory.textContent =
        "-- MB";


    planHumanTitle.textContent =
        "Running PostgreSQL analysis...";

    planHumanDescription.textContent =
        "Waiting for EXPLAIN ANALYZE results.";


    planType.textContent =
        "--";

    planTypeExplanation.textContent =
        "Waiting for PostgreSQL.";


    postgresExecutionTime.textContent =
        "-- ms";

    planningTime.textContent =
        "-- ms";

    firstRowTime.textContent =
        "-- ms";

    lastRowTime.textContent =
        "-- ms";

    actualRows.textContent =
        "--";

    rowsRemoved.textContent =
        "--";

    rowsRemovedExplanation.textContent =
        "Waiting for filter statistics.";

    sharedHits.textContent =
        "--";

    sharedReads.textContent =
        "--";


    executionStory.textContent =
        "SearchLab is waiting for PostgreSQL's execution report.";


    rawQueryPlan.textContent =
        "Waiting for response...";


    benchmarkV1App.textContent =
        "-- ms";

    benchmarkV1Database.textContent =
        "-- ms";

    benchmarkV1Plan.textContent =
        "--";
}


// =========================================================
// SEARCH ERROR
// =========================================================

function renderSearchError() {
    currentResults = [];

    resultsContainer.replaceChildren();

    renderEmptyResults();

    resultCount.textContent =
        "0";

    resultsSummary.textContent =
        "The search request failed.";

    seeMoreContainer.hidden =
        true;

    renderMissingQueryPlan();
}


// =========================================================
// LOADING
// =========================================================

function setLoading(loading) {
    searchButton.disabled =
        loading;


    searchInput.disabled =
        loading;


    searchButton.textContent =
        loading
            ? "Searching..."
            : "Search";
}


// =========================================================
// MESSAGE
// =========================================================

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


// =========================================================
// FORMATTERS
// =========================================================

function toNumber(value) {
    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : null;
}


function formatMilliseconds(value) {
    const number =
        toNumber(value);


    if (number === null) {
        return "-- ms";
    }


    return `${number.toFixed(3)} ms`;
}


function formatMemory(value) {
    const number =
        toNumber(value);


    if (number === null) {
        return "-- MB";
    }


    return `${number.toFixed(3)} MB`;
}


function formatInteger(value) {
    const number =
        toNumber(value);


    if (number === null) {
        return "--";
    }


    return Math.round(
        number
    ).toLocaleString();
}


function formatPrice(value) {
    const number =
        toNumber(value);


    if (number === null) {
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