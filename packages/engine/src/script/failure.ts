import { message } from '../../../contracts/src/messages';

/** Internal structural context is a diagnostic value, beneath the existing localized error. */
export function invalidDetail(context: string): Error {
  return new Error(message('copy.ledger.59439895da', { p0: context }));
}
