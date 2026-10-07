import { Host } from './host';
const host = new Host((reply) => self.postMessage(reply));
self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'cancel') {
    host.cancelled = true;
    return;
  }
  void host.handle(event.data).then((reply) => self.postMessage(reply));
};
