/**
 * Lightweight contract shape checks for CT-01 … CT-17.
 * Asserts each producer responds and returns the expected contractId + core keys.
 */
const { CONTRACTS, urlFor } = require('../shared/contracts');
const { PAYLOADS, requiredKeys } = require('../shared/payloads');

async function check(ct) {
  const url = urlFor(ct.producer, ct.path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const body = await res.json();
  if (body.contractId !== ct.id) throw new Error(`Expected contractId ${ct.id}, got ${body.contractId}`);
  for (const key of requiredKeys(ct.id)) {
    if (!(key in body)) throw new Error(`${ct.id} missing key "${key}"`);
  }
  // Ensure sample shape keys still present in catalog payload definition
  if (!PAYLOADS[ct.id]) throw new Error(`No sample payload for ${ct.id}`);
  return { id: ct.id, producer: ct.producer, consumer: ct.consumer, direction: ct.direction, url, status: 'PASS' };
}

async function main() {
  const results = [];
  let failed = 0;
  for (const ct of CONTRACTS) {
    try {
      results.push(await check(ct));
      console.log(`PASS  ${ct.id}  ${ct.producer}→${ct.consumer}  (${ct.direction})`);
    } catch (err) {
      failed += 1;
      results.push({
        id: ct.id,
        producer: ct.producer,
        consumer: ct.consumer,
        direction: ct.direction,
        status: 'FAIL',
        error: String(err.message || err),
      });
      console.log(`FAIL  ${ct.id}  ${ct.producer}→${ct.consumer}  ${err.message}`);
    }
  }
  console.log(`\n${results.filter((r) => r.status === 'PASS').length}/${CONTRACTS.length} contracts passed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
