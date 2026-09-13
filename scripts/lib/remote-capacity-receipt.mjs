import { isAbsolute } from 'node:path';

/** Deployment receipts cross a local-to-SSH trust boundary. Validate every
 * value used in a path before invoking build, SSH or SCP. */
export function validateRemoteCapacityReceipt(value) {
  if (!value || typeof value !== 'object' || value.hosted !== true ||
      !/^[a-f0-9]{64}$/.test(value.fixtureId) ||
      typeof value.validator !== 'string' || !isAbsolute(value.validator)) {
    throw new Error('Invalid hosted capacity deployment receipt');
  }
  return { fixtureId: value.fixtureId, validator: value.validator };
}
