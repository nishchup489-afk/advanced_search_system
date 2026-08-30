"use strict";

const guides = [
    { id: "v1", label: "V1", title: "ILIKE baseline", file: "./content/v1.md" },
    { id: "v2", label: "V2", title: "Full-text search", file: "./content/v2.md" },
    { id: "v3", label: "V3", title: "FTS + GIN", file: "./content/v3.md" },
    { id: "v4", label: "V4", title: "Fuzzy recovery", file: "./content/v4.md" },
    { id: "v5", label: "V5", title: "Redis caching", file: "./content/v5.md" },
];

const versionNavigation = document.getElementById("docs-version-navigation");
const toc = document.getElementById("docs-toc");
const article = document.getElementById("docs-article");
const status = document.getElementById("docs-status");
const searchInput = document.getElementById("docs-search");
const searchResults = document.getElementById("docs-search-results");
const previousLink = document.getElementById("docs-previous");
const nextLink = document.getElementById("docs-next");

let currentGuide = null;
let currentHeadings = [];

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function slugify(value, usedSlugs) {
    const base = value.toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    let slug = base;
    let counter = 2;
    while (usedSlugs.has(slug)) {
        slug = `${base}-${counter++}`;
    }
    usedSlugs.add(slug);
    return slug;
}

function renderInline(value) {
    let output = escapeHtml(value);
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    output = output.replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,;:!?])/g, "$1<em>$2</em>");
    return output;
}

function markdownToHtml(markdown) {
    const lines = markdown.replaceAll("\r\n", "\n").split("\n");
    const html = [];
    const headings = [];
    const usedSlugs = new Set();
    let paragraph = [];
    let inCode = false;
    let codeLanguage = "";
    let codeLines = [];

    const flushParagraph = () => {
        if (paragraph.length) {
            html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
            paragraph = [];
        }
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (line.startsWith("```")) {
            flushParagraph();
            if (inCode) {
                html.push(`<pre><code data-language="${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
                inCode = false;
                codeLines = [];
            } else {
                inCode = true;
                codeLanguage = line.slice(3).trim();
            }
            continue;
        }

        if (inCode) {
            codeLines.push(line);
            continue;
        }

        const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            const level = headingMatch[1].length;
            const text = headingMatch[2].replace(/#+$/, "").trim();
            const slug = slugify(text, usedSlugs);
            headings.push({ level, text: text.replace(/[*_`]/g, ""), slug });
            html.push(`<h${level} id="${slug}">${renderInline(text)}</h${level}>`);
            continue;
        }

        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushParagraph();
            html.push("<hr>");
            continue;
        }

        if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
            flushParagraph();
            const headerCells = line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
            index += 2;
            const rows = [];
            while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
                rows.push(lines[index].replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
                index += 1;
            }
            index -= 1;
            html.push(`<div class="table-wrap"><table><thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
            continue;
        }

        if (/^\s*>/.test(line)) {
            flushParagraph();
            const quote = [];
            while (index < lines.length && /^\s*>/.test(lines[index])) {
                quote.push(lines[index].replace(/^\s*>\s?/, ""));
                index += 1;
            }
            index -= 1;
            html.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
            continue;
        }

        const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
            flushParagraph();
            const orderedList = Boolean(ordered);
            const items = [];
            const pattern = orderedList ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
            while (index < lines.length) {
                const match = lines[index].match(pattern);
                if (!match) break;
                items.push(match[1]);
                index += 1;
            }
            index -= 1;
            const tag = orderedList ? "ol" : "ul";
            html.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`);
            continue;
        }

        if (!line.trim()) {
            flushParagraph();
            continue;
        }

        paragraph.push(line.trim());
    }

    flushParagraph();
    if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }

    return { html: html.join("\n"), headings };
}

function renderVersionNavigation(activeId) {
    versionNavigation.innerHTML = guides.map((guide) => `
        <a href="?version=${guide.id}"${guide.id === activeId ? ' aria-current="page"' : ""}>
            <strong>${guide.label}</strong>
            <span>${guide.title}</span>
        </a>
    `).join("");
}

function renderToc(headings) {
    const visible = headings.filter((heading) => heading.level === 2 || heading.level === 3);
    toc.innerHTML = visible.map((heading) => `
        <a href="#${heading.slug}" data-level="${heading.level}">${escapeHtml(heading.text)}</a>
    `).join("");
}

function renderPagination(index) {
    const previous = guides[index - 1];
    const next = guides[index + 1];
    previousLink.textContent = previous ? `← ${previous.label} · ${previous.title}` : "";
    previousLink.href = previous ? `?version=${previous.id}` : "#";
    nextLink.textContent = next ? `${next.label} · ${next.title} →` : "";
    nextLink.href = next ? `?version=${next.id}` : "#";
}

function updateSearchResults(query) {
    const term = query.trim().toLowerCase();
    if (!term) {
        searchResults.hidden = true;
        searchResults.innerHTML = "";
        return;
    }

    const matches = currentHeadings.filter((heading) => heading.text.toLowerCase().includes(term)).slice(0, 12);
    searchResults.hidden = false;
    searchResults.innerHTML = matches.length
        ? `<strong>${matches.length} matching section${matches.length === 1 ? "" : "s"}</strong>${matches.map((heading) => `<a href="#${heading.slug}">${escapeHtml(heading.text)}</a>`).join("")}`
        : `<strong>No section titles match “${escapeHtml(query)}”</strong><span>Try a broader technical term.</span>`;
}

async function loadGuide(id) {
    const index = Math.max(0, guides.findIndex((guide) => guide.id === id));
    const guide = guides[index];
    currentGuide = guide;
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = `Loading ${guide.label} documentation…`;
    article.hidden = true;

    renderVersionNavigation(guide.id);
    renderPagination(index);

    try {
        const response = await fetch(guide.file, { headers: { Accept: "text/markdown" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        const rendered = markdownToHtml(markdown);
        currentHeadings = rendered.headings;
        article.innerHTML = rendered.html;
        renderToc(currentHeadings);
        document.title = `${guide.label} ${guide.title} · SearchLab Docs`;
        status.hidden = true;
        article.hidden = false;
        updateSearchResults(searchInput.value);
    } catch (error) {
        status.classList.add("is-error");
        status.textContent = `Could not load ${guide.label} documentation (${error.message}). Serve the frontend over HTTP rather than opening files directly.`;
    }
}

searchInput.addEventListener("input", () => updateSearchResults(searchInput.value));

const requestedVersion = new URLSearchParams(window.location.search).get("version") || "v1";
loadGuide(requestedVersion);
