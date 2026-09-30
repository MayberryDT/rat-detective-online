/** Worker secrets: set with `wrangler secret put`, so `wrangler types` cannot list them. Absent locally and in tests. */
interface Env {
	/** TypeSafe's key for the Jev mind; never sent to a client. */
	TYPESAFE_API_KEY?: string;
}
