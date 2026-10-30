
import { logUserActivity } from "../services/userActivity.service.js";

const getAction = (method, path) => {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath.includes("import")) return "DATA_IMPORTED";
  if (normalizedPath.includes("export")) return "DATA_EXPORTED";

  switch (method) {
    case "GET":
      return "DATA_VIEWED";
    case "POST":
      return "DATA_CREATED";
    case "PUT":
    case "PATCH":
      return "DATA_UPDATED";
    case "DELETE":
      return "DATA_DELETED";
    default:
      return "API_ACCESS";
  }
};

export const userActivityLogger = (req, res, next) => {
  // Register a response callback; do not delay the API response.
  res.on("finish", () => {
    // Record only successful responses.
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const path = req.baseUrl + req.path;
    const action = getAction(req.method, path);

    // Avoid storing query strings, request bodies, passwords, or tokens.
    const resource = req.params.resource
      || (path.includes("/users") ? "user" : null)
      || (path.includes("/roles") ? "role" : null)
      || (path.includes("/dashboard") ? "dashboard" : null)
      || "api";

    void logUserActivity(req, {
      action,
      description: `${req.method} ${path} completed successfully`,
      resource,
      resourceId: req.params.id || req.params.jobId || null,
      metadata: {
        method: req.method,
        path,
        statusCode: res.statusCode,
      },
    });
  });

  next();
};
