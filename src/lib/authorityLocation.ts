/**
 * Where the rules engine and Founderbot driver run.
 *
 * Host-device is the current transport: mixed IPs and iOS suspend freeze the
 * table because guests cannot apply actions or drive AI without the phone.
 * A cloud/edge adapter should implement the same AuthorityOutbound messages
 * so useOnlineBoardSync does not care where applyGameAction runs.
 */
export type AuthorityLocation = 'host-device' | 'cloud-edge'

/** Until a cloud authority exists, the hosting phone is the single writer. */
export const AUTHORITY_LOCATION: AuthorityLocation = 'host-device'
