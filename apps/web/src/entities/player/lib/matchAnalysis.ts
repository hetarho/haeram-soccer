export function observedRate(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? (100 * numerator) / denominator : undefined,
  };
}
