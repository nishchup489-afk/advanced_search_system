"use strict";

(() => {
    const script = document.currentScript;
    const root = script?.dataset.root || ".";
    const current = script?.dataset.current || "home";

    const links = [
        ["home", "Home", `${root}/index.html`],
        ["v1", "V1", `${root}/v1/v1.html`],
        ["v2", "V2", `${root}/v2/v2.html`],
        ["v3", "V3", `${root}/v3/v3.html`],
        ["v4", "V4", `${root}/v4/v4.html`],
        ["v5", "V5", `${root}/v5/v5.html`],
        ["docs", "Docs", `${root}/docs/index.html`],
    ];

    const nav = document.createElement("nav");
    nav.className = "global-navigation";
    nav.setAttribute("aria-label", "Primary navigation");
    nav.dataset.open = "false";

    const linkMarkup = links.map(([key, label, href]) => {
        const currentAttribute = key === current ? ' aria-current="page"' : "";
        const docsClass = key === "docs" ? ' class="global-navigation__docs"' : "";
        return `<a${docsClass} href="${href}"${currentAttribute}>${label}</a>`;
    }).join("");

    nav.innerHTML = `
        <div class="global-navigation__inner">
            <a class="global-navigation__brand" href="${root}/index.html">
                Search<span>Lab</span>
            </a>
            <button
                class="global-navigation__toggle"
                type="button"
                aria-expanded="false"
                aria-controls="global-navigation-links"
                aria-label="Open navigation"
            >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </button>
            <div id="global-navigation-links" class="global-navigation__links">
                ${linkMarkup}
            </div>
        </div>
    `;

    document.body.prepend(nav);
    document.body.classList.add("has-global-navigation");

    const toggle = nav.querySelector(".global-navigation__toggle");
    const closeMenu = () => {
        nav.dataset.open = "false";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation");
    };

    toggle.addEventListener("click", () => {
        const willOpen = nav.dataset.open !== "true";
        nav.dataset.open = String(willOpen);
        toggle.setAttribute("aria-expanded", String(willOpen));
        toggle.setAttribute("aria-label", willOpen ? "Close navigation" : "Open navigation");
    });

    nav.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            closeMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    document.addEventListener("click", (event) => {
        if (!nav.contains(event.target)) {
            closeMenu();
        }
    });
})();
