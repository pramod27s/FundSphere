/**
 * Runtime configuration. Values come from Vite env vars (VITE_*) so the same
 * build can target local, staging or production backends. See .env.example.
 */
const DEFAULT_API_URL = 'http://localhost:8080';

/** Base URL of the Spring Boot backend, without a trailing slash. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
