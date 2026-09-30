/** Worker secrets and deploy-time vars: set with `wrangler secret put` or `wrangler deploy --var`, so `wrangler types`
 * cannot list them. Absent locally and in tests. */
interface Env {
	/** TypeSafe's key for the Jev mind; never sent to a client. */
	TYPESAFE_API_KEY?: string;
	/** The release name, `<env>-<YYYY-MM-DD>-<git short sha>[-dirty]`, set by scripts/deploy.mjs; the city facts' `build`. */
	BUILD?: string;
	/** Staging playtests only: a comma-separated incident allow-list, set by scripts/deploy.mjs from `INCIDENTS`. */
	INCIDENTS?: string;
}
