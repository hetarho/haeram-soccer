import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import {
  ACTIVE,
  PORTABLE_FILE_LIMIT,
  MANIFEST,
  PREVIOUS,
  type IndexedCheckpoints,
  type Lineage,
  type Source,
  type StoragePort,
} from './repository';

/** Copy and verify the predecessor, then active, then acknowledge its committed lineage. */
export async function writeCheckpoint(
  storage: StoragePort,
  indexed: IndexedCheckpoints,
  source: Source | undefined,
  committed: string | null,
  raw: string,
  lineage: Lineage,
): Promise<Source> {
  // The envelope is ASCII (base64 payload), so its length is its byte count.
  if (raw.length > PORTABLE_FILE_LIMIT)
    throw new Error(sourceMessage('copy.checkpointWriter.4a44044c3b'));
  if (committed !== null && source !== PREVIOUS) await indexed.previous.write(committed);
  if (committed === null) await indexed.previous.clear();
  await indexed.active.write(raw);
  const manifest = JSON.stringify(lineage);
  storage.setItem(MANIFEST, manifest);
  if (storage.getItem(MANIFEST) !== manifest)
    throw new Error(sourceMessage('copy.checkpointWriter.d86e4f08f5'));
  return ACTIVE;
}
