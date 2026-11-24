import { describe, expect, it } from 'vitest';
import { message } from '../../contracts/src/messages';
import { sourceMessages } from '../../contracts/src/source-messages';
import { TICKET_LEVELS, TOP_TICKET, topTicketSummary } from './tickets';

describe('the highest ticket preset explains its forecast (→WEB-14, →ECON-9/17)', () => {
  const capacity = 40000;
  it('reads a sellout, a possible sellout or seats left from the forecast range', () => {
    expect(topTicketSummary({ attendanceLow: capacity, attendanceHigh: capacity, capacity })).toBe(
      message('copy.tickets.578dac4fbc'),
    );
    expect(topTicketSummary({ attendanceLow: 32000, attendanceHigh: capacity, capacity })).toBe(
      message('copy.tickets.bc4e97fdc3'),
    );
    expect(topTicketSummary({ attendanceLow: 12173, attendanceHigh: 15216, capacity })).toBe(
      message('copy.tickets.a7f8479e35'),
    );
    // Every explanation keeps the highest receipt per ticket.
    for (const id of ['578dac4fbc', 'bc4e97fdc3', 'a7f8479e35'] as const)
      expect(message(`copy.tickets.${id}`)).toContain('1장당 입장 수입은 가장 높아요');
  });

  it('writes a neutral price fact into new events and keeps the older prose resolvable', () => {
    expect(TOP_TICKET).toBe(Math.max(...TICKET_LEVELS.map((level) => level.price)));
    expect(TICKET_LEVELS.at(-1)!.summary).toBe(message('copy.tickets.6d9abb5a86'));
    // Saved club-ticket events carry the earlier summary as stored prose (→ARCH-32).
    expect(sourceMessages['copy.tickets.e1053f0d37']).toBe(
      '빈자리가 늘지만 1장당 입장 수입은 가장 높아요',
    );
  });
});
