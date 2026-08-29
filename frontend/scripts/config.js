const IS_LOCAL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

export const API_URL = IS_LOCAL
    ? "http://127.0.0.1:8000"
    : "https://your-backend-url.com";