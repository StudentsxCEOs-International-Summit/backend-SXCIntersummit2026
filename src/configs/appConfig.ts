/**
 * Application-level configuration for dynamic deadlines and feature flags.
 *
 * Default values can be overridden via environment variables.
 * For a production system these would live in a database table so admins
 * can change them at runtime without redeploying.
 */

export interface AppConfigType {
  /** ISO-8601 deadline for standard registration */
  REGISTRATION_DEADLINE: string;
  /** ISO-8601 extended deadline (used when registration is extended) */
  REGISTRATION_EXTENDED_DEADLINE: string;
  /** Whether extended registration is currently active */
  EXTENDED_REGISTRATION_ENABLED: boolean;
  /** Maximum slide count for semifinal deck upload */
  MAX_SLIDE_PAGES: number;
  /** Maximum file size for slide upload in MB */
  MAX_SLIDE_SIZE_MB: number;
}

function loadFromEnv(): AppConfigType {
  return {
    REGISTRATION_DEADLINE:
      process.env.REGISTRATION_DEADLINE || "2026-11-15T23:59:59+07:00",
    REGISTRATION_EXTENDED_DEADLINE:
      process.env.REGISTRATION_EXTENDED_DEADLINE || "2026-11-30T23:59:59+07:00",
    EXTENDED_REGISTRATION_ENABLED:
      process.env.EXTENDED_REGISTRATION_ENABLED === "true",
    MAX_SLIDE_PAGES: Number(process.env.MAX_SLIDE_PAGES) || 5,
    MAX_SLIDE_SIZE_MB: Number(process.env.MAX_SLIDE_SIZE_MB) || 20,
  };
}

/** Singleton config – call `reloadAppConfig()` to refresh from env */
let _config: AppConfigType = loadFromEnv();

export function getAppConfig(): AppConfigType {
  return _config;
}

export function reloadAppConfig(): AppConfigType {
  _config = loadFromEnv();
  console.log("[APP CONFIG] Configuration reloaded:", _config);
  return _config;
}

/**
 * Returns the currently effective registration deadline.
 * If extended registration is enabled, returns the extended deadline.
 */
export function getEffectiveDeadline(): Date {
  const cfg = getAppConfig();
  const dateStr = cfg.EXTENDED_REGISTRATION_ENABLED
    ? cfg.REGISTRATION_EXTENDED_DEADLINE
    : cfg.REGISTRATION_DEADLINE;
  return new Date(dateStr);
}

/**
 * Checks whether registration is still open.
 */
export function isRegistrationOpen(): boolean {
  return new Date() < getEffectiveDeadline();
}
