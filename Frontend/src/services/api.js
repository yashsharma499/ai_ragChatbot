import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000",
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Let the browser set the multipart boundary itself.
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/* ------------------------------------------------------------------ *
 * Errors
 *
 * Every rejection is an Error with `.message`, `.status` and `.code`, so
 * callers can simply read `err.message`. The previous version rejected with a
 * plain object while every component read `err.response.data.message`, so no
 * server-side error message ever reached the user.
 * ------------------------------------------------------------------ */
export class ApiError extends Error {
  constructor(message, { status = 0, code = null, fields = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function messageFor(error) {
  const data = error.response?.data;

  if (typeof data?.message === "string" && data.message) return data.message;
  if (typeof data?.error === "string" && data.error) return data.error;

  if (error.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }
  if (!error.response) {
    return "Cannot reach the server. Check that the backend is running.";
  }

  switch (error.response.status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to do that.";
    case 404:
      return "That resource could not be found.";
    case 413:
      return "That file is too large.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 503:
      return "The service is temporarily unavailable. Please try again shortly.";
    default:
      return error.message || "Something went wrong";
  }
}

// Set by AuthContext so a 401 can clear React state instead of hard-reloading.
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;

    const apiError = new ApiError(messageFor(error), {
      status,
      code: data?.code ?? null,
      fields: data?.fields ?? null,
    });

    // Only treat a 401 as a session expiry. A 403 means the user is signed in
    // but lacks permission, and must not log them out.
    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (onUnauthorized) {
        onUnauthorized(apiError);
      } else if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }

    return Promise.reject(apiError);
  }
);

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */
const unwrap = (response) => response.data?.data ?? response.data ?? {};

export const authAPI = {
  login: async (payload) => unwrap(await api.post("/auth/login", payload)),
  register: async (payload) => unwrap(await api.post("/auth/register", payload)),
  me: async () => (await api.get("/auth/me")).data?.data?.user ?? null,
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },
};

export const documentAPI = {
  list: async () => unwrap(await api.get("/documents/list")).documents ?? [],
  get: async (id) => unwrap(await api.get(`/documents/${id}`)).document ?? null,
  upload: async (file, { onProgress } = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    return unwrap(
      await api.post("/documents/upload", formData, {
        timeout: 120000,
        onUploadProgress: (event) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded * 100) / event.total));
          }
        },
      })
    );
  },
  remove: async (id) => unwrap(await api.delete(`/documents/${id}`)),
};

export const chatAPI = {
  ask: async ({ documentId, question }) => {
    if (!documentId) throw new ApiError("Select a document first", { status: 400 });
    return unwrap(await api.post("/chat/ask", { documentId, question }));
  },
  history: async (documentId) => {
    if (!documentId) throw new ApiError("Select a document first", { status: 400 });
    const data = unwrap(
      await api.get("/chat/history", { params: { documentId } })
    );
    return data.messages ?? [];
  },
  clear: async (documentId) =>
    unwrap(await api.delete("/chat/history", { params: { documentId } })),
};

export const adminAPI = {
  stats: async () => unwrap(await api.get("/admin/stats")).stats ?? {},
  users: async (search) =>
    unwrap(await api.get("/admin/users", { params: { search } })).users ?? [],
  userDocuments: async (userId) => unwrap(await api.get(`/admin/users/${userId}/documents`)),
  userQueries: async (userId, params) =>
    unwrap(await api.get(`/admin/users/${userId}/queries`, { params })),
  documents: async (params) => unwrap(await api.get("/admin/documents", { params })),
  toggleDocument: async (id) => unwrap(await api.patch(`/admin/documents/${id}/toggle`)),
  queries: async (params) => unwrap(await api.get("/admin/queries", { params })),
  usage: async () => unwrap(await api.get("/admin/usage")),
};

export const healthAPI = {
  check: async () => (await api.get("/health")).data,
};

export default api;
