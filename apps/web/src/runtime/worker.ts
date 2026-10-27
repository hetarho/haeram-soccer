import { Host } from './host';
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
  void host.handle(event.data).then((reply) => self.postMessage(forPosting(reply)));
};
