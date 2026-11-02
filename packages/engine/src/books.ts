/**
 * Season books of every club nobody owns (→ECON-36). Both season closes call `booksClose`; T656
 * settles each club's season here.
 */
import type { World } from '../../contracts/src/types';

/** Every club nobody owns closes the season's books (→ECON-36): settled by T656. */
export function booksClose(w: World) {
  void w;
}
