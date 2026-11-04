import { message as sourceMessage } from '../../contracts/src/messages';
/** The existing admission-price choices, shared by commands and presentation. */
export const TICKET_LEVELS = [
  {
    price: 0.02,
    name: sourceMessage('copy.tickets.3230494d1d'),
    summary: sourceMessage('copy.tickets.cd3e269054'),
  },
  {
    price: 0.035,
    name: sourceMessage('copy.tickets.ae6ca6ec37'),
    summary: sourceMessage('copy.tickets.b33c04a1ba'),
  },
  {
    price: 0.05,
    name: sourceMessage('copy.teamState.666599febd'),
    summary: sourceMessage('copy.tickets.9cb4ec35ea'),
  },
  {
    price: 0.08,
    name: sourceMessage('copy.tickets.53001bcd73'),
    summary: sourceMessage('copy.tickets.572bfecadd'),
  },
  {
    price: 0.12,
    name: sourceMessage('copy.tickets.4761d1b6bd'),
    summary: sourceMessage('copy.tickets.e1053f0d37'),
  },
] as const;
