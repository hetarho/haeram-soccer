/**
 * The ticket price presets, cheapest first. Ordered presets keep the existing ticket rule; 0.05
 * is the founding price (→ECON-17). Its own module so home's cash remedy reads them without
 * loading the operating board.
 */
export const TICKET_LEVELS = [
  { price: 0.02, name: '아주 저렴', summary: '관중을 최대한 모으고 입장 수입은 낮아요' },
  { price: 0.035, name: '저렴', summary: '관중이 늘고 1장당 수입은 줄어요' },
  { price: 0.05, name: '보통', summary: '창단 기본 가격' },
  { price: 0.08, name: '비싸게', summary: '관중은 줄고 1장당 수입은 늘어요' },
  { price: 0.12, name: '프리미엄', summary: '빈자리가 늘지만 경기당 입장 수입이 가장 커요' },
] as const;

/** The first preset above a price, if any: a custom price from an older save steps to the next. */
export const nextTicketLevel = (price: number) =>
  TICKET_LEVELS.find((level) => level.price > price);
