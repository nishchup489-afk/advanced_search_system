const IS_LOCAL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "0.0.0.0";

const CONFIGURED_API_URL =
    document
        .querySelector('meta[name="api-base-url"]')
        ?.content
        .trim();

export const API_URL = CONFIGURED_API_URL || (
    IS_LOCAL
        ? "http://127.0.0.1:8000"
        : "https://advanced-search-system-cgf4.onrender.com"
);
