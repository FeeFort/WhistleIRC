import { config } from "../config.js";
import { ErrorWithCode, ErrorWithRetryAfter } from "../types.js";
import OsuApiError from "./osuApiError.js";

function hasErrorCode(error: unknown): error is ErrorWithCode {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}

export function hasRetryAfter(error: unknown): error is ErrorWithRetryAfter {
    return typeof error === "object" && error !== null && "retryAfter" in error && typeof error.retryAfter === "number";
}

function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError && error.message === "fetch failed" && hasErrorCode(error.cause) && config.retryableNetworkErrors.has(error.cause.code);
}

export default function isRetryableError(error: unknown): boolean {
    if (error instanceof OsuApiError) return config.retryableErrorStatuses.has(error.status);
    if (hasErrorCode(error) && error.code === "REQUEST_TIMEOUT") return true
    if (hasErrorCode(error) && error.code === "RATE_LIMITED" && hasRetryAfter(error) && error.retryAfter <= config.transportRetry.maxRetryAfter) return true
    return isNetworkError(error);
}
