import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioCheckoutAllowed } from '../scripts/portfolio-checkout-policy.mjs';
const env = { PORTFOLIO_SANDBOX:'1', HOMOLOGATION_API_PORT:'55484', HOMOLOGATION_GATEWAY_PORT:'55485', HOMOLOGATION_EXPECTED_DATABASE:'tbh_portfolio_dev' };
const identity = { portfolio:true, sandboxCredentialValidated:true, provider:'PostgreSQL', database:'tbh_portfolio_dev', returnUrl:'https://127.0.0.1:55485/menu' };
test('persistent checkout requires every explicit capability and exact local origin', () => {
  assert.equal(portfolioCheckoutAllowed(env, identity), true);
  for (const key of Object.keys(env)) assert.equal(portfolioCheckoutAllowed({ ...env, [key]:'wrong' }, identity), false, key);
  for (const key of Object.keys(identity)) assert.equal(portfolioCheckoutAllowed(env, { ...identity, [key]:null }), false, key);
  assert.equal(portfolioCheckoutAllowed({ ...env, HOMOLOGATION_DISABLE_CHECKOUT:'1' }, identity), false);
  assert.equal(portfolioCheckoutAllowed({ HOMOLOGATION_PUBLIC_READY:'1' }, identity), false);
});
