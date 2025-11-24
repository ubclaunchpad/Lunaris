import { vi } from "vitest";

process.env.NEXT_PUBLIC_API_GATEWAY_URL = "https://test-api.example.com";

global.fetch = vi.fn();

// Mock CSS imports
vi.mock("*.css", () => ({}));
vi.mock("*.module.css", () => ({}));

// Prevent PostCSS from loading
process.env.VITE_DISABLE_POSTCSS = "true";
