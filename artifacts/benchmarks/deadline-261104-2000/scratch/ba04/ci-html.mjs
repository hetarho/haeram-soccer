import {publicJobResult} from '/home/deep/.npm/_npx/26287f45a133efbe/node_modules/haeram-spec-creator/src/vibe-ci.mjs';
export function jobHtml(html, id) {
  const result = html.match(new RegExp(`data-url=["'][^"']*/runs/${id}/header["'][^>]*>\\s*(succeeded|failed|cancelled|skipped|timed out)\\s*<relative-time`, 'i'))?.[1]?.toLowerCase();
  const conclusion = {succeeded:'success',failed:'failure',cancelled:'cancelled',skipped:'skipped','timed out':'timed_out'}[result];
  if (!conclusion) return html;
  return html.replace(/<[^>]*data-job-status=["']completed["'][^>]*>/g, tag => /data-(?:job-)?conclusion=["'][^"']+["']/.test(tag) ? tag : tag.replace(/>$/, ` data-job-conclusion="${conclusion}">`));
}
export function parsed(html, url, name) { return publicJobResult(html, {url,name}); }
