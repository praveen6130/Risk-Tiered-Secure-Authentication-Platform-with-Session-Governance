/**
 * Safely extracts a human-readable error message string from any error shape.
 * Handles FastAPI/Pydantic validation errors ({type, loc, msg, input}),
 * string details, arrays, and nested objects.
 *
 * @param error - The caught error (Axios error, generic Error, or unknown)
 * @param fallback - Default message if nothing can be extracted
 * @returns A plain string safe for rendering in JSX and toast()
 */
export function extractErrorMessage(error: any, fallback = 'An error occurred. Please try again.'): string {
  if (!error) return fallback;

  // Axios-style: error.response.data.detail or error.response.data.message
  const detail = error?.response?.data?.detail ?? error?.data?.detail ?? error?.response?.data?.message ?? error?.detail;

  if (detail !== undefined && detail !== null) {
    if (typeof detail === 'string') return detail;

    // FastAPI Pydantic V2 validation errors → array of {type, loc, msg, input}
    if (Array.isArray(detail)) {
      return detail
        .map((d: any) => {
          if (typeof d === 'string') return d;
          if (d && typeof d === 'object') {
            const field = Array.isArray(d.loc)
              ? d.loc.filter((l: any) => l !== 'body').join('.')
              : '';
            const msg = d.msg || d.message || JSON.stringify(d);
            return field ? `${field}: ${msg}` : String(msg);
          }
          return JSON.stringify(d);
        })
        .join(', ');
    }

    // Single validation error object
    if (typeof detail === 'object') {
      const field = Array.isArray(detail.loc)
        ? detail.loc.filter((l: any) => l !== 'body').join('.')
        : '';
      const msg = detail.msg || detail.message;
      if (msg) return field ? `${field}: ${msg}` : String(msg);
      return JSON.stringify(detail);
    }

    return String(detail);
  }

  // Direct Pydantic validation object passed as error
  if (error && typeof error === 'object' && (error.type || error.loc || error.msg)) {
    const field = Array.isArray(error.loc)
      ? error.loc.filter((l: any) => l !== 'body').join('.')
      : '';
    const msg = error.msg || error.message;
    if (msg) return field ? `${field}: ${msg}` : String(msg);
    return JSON.stringify(error);
  }

  // Generic Error
  if (error.message && typeof error.message === 'string') return error.message;

  // Last resort
  if (typeof error === 'string') return error;

  return fallback;
}

/**
 * Safely extracts the detail value from an Axios error for inline toast use.
 * Always returns a string.
 */
export function safeDetail(error: any, fallback: string): string {
  return extractErrorMessage(error, fallback);
}
