/** The shipped city layout's version (re-exported by `grayboxLayout`). A leaf module, so code that must know the shipped
 * layout (the shared caches in `sharedLayout`, `ChaosSimulation`) still can when a test mocks `grayboxLayout`. */
export const GRAYBOX_VERSION = 7;
