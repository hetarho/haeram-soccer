import { Host } from './host';
import { HelperPool } from './helperPool';
import { forPosting } from './viewPublisher';
const host = new Host((reply) => self.postMessage(reply));
self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'cancel') {
    host.cancelled = true;
    return;
  }
  // The client hands over its codec worker's port before any request.
  if (event.data?.type === 'codec') {
    host.codec = event.data.port;
    return;
  }
  // And its fixture helpers' ports, when it could create them; a helper error ends their use.
  if (event.data?.type === 'helpers') {
    host.helpers = new HelperPool(event.data.ports);
    return;
  }
  if (event.data?.type === 'helpers-failed') {
    host.helpers?.disable();
    return;
  }
  void host.handle(event.data).then((reply) => self.postMessage(forPosting(reply)));
};
