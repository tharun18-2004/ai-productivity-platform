import axios from "axios";

export const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
  process.env.BACKEND_API_BASE_URL ||
  "http://127.0.0.1:5000";

export const api = axios.create({
  baseURL: BACKEND_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" }
});
