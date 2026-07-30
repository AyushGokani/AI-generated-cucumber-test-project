import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  JIRA_BASE_URL: z.string().url().default("https://example.atlassian.net"),
  JIRA_EMAIL: z.string().default("dev@example.com"),
  JIRA_API_TOKEN: z.string().default(""),
  JIRA_PROJECT_KEY: z.string().default("PROJ"),
  JIRA_JQL: z
    .string()
    .default(
      'project = PROJ AND status = "Ready for Automation" AND labels = cucumber-auto',
    ),
  JIRA_TRANSITION_IN_REVIEW: z.string().optional().default(""),
  JIRA_TRANSITION_DONE: z.string().optional().default(""),

  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o"),
  LLM_MODE: z.enum(["live", "mock"]).default("mock"),

  GITHUB_TOKEN: z.string().default(""),
  GITHUB_OWNER: z.string().default("AyushGokani"),
  GITHUB_REPO: z
    .string()
    .default("AI-generated-cucumber-test-project"),
  GITHUB_BASE_BRANCH: z.string().default("main"),

  PORT: z.coerce.number().default(3000),
  WEBHOOK_SECRET: z.string().default("change-me"),
  POLL_INTERVAL_MINUTES: z.coerce.number().default(0),
  DRY_RUN: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);

export function assertLiveIntegrations(cfg: AppConfig = config): void {
  const missing: string[] = [];
  if (!cfg.JIRA_API_TOKEN) missing.push("JIRA_API_TOKEN");
  if (!cfg.GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (cfg.LLM_MODE === "live" && !cfg.LLM_API_KEY) missing.push("LLM_API_KEY");
  if (missing.length) {
    throw new Error(
      `Missing required env vars for live mode: ${missing.join(", ")}. Copy .env.example → .env`,
    );
  }
}
