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
    // A neutral price fact: the applied-price event claims nothing about future crowds (→WEB-14).
    // Older saves keep copy.tickets.e1053f0d37's prose, whose resource stays (→ARCH-32).
    summary: sourceMessage('copy.tickets.6d9abb5a86'),
  },
] as const;

/** The highest allowed preset, whose explanation reads its own forecast (→WEB-14). */
export const TOP_TICKET = TICKET_LEVELS[TICKET_LEVELS.length - 1].price;

/**
 * What the highest preset's attendance forecast says (→WEB-14, →ECON-9): a range wholly at usable
 * capacity is a projected sellout, one reaching it only at its high end a possible sellout, and
 * one below it leaves seats empty; each keeps the highest receipt per ticket.
 */
export function topTicketSummary(gate: {
  attendanceLow: number;
  attendanceHigh: number;
  capacity: number;
}) {
  if (gate.attendanceLow >= gate.capacity) return sourceMessage('copy.tickets.578dac4fbc');
  if (gate.attendanceHigh >= gate.capacity) return sourceMessage('copy.tickets.bc4e97fdc3');
  return sourceMessage('copy.tickets.a7f8479e35');
}
