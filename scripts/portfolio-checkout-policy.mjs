// A browser flag or public-ready alone cannot enable checkout for the persistent database.
export function portfolioCheckoutAllowed(env, isolation) {
  return env.PORTFOLIO_SANDBOX === '1' && env.HOMOLOGATION_DISABLE_CHECKOUT !== '1' &&
    env.HOMOLOGATION_API_PORT === '55484' && env.HOMOLOGATION_GATEWAY_PORT === '55485' &&
    env.HOMOLOGATION_EXPECTED_DATABASE === 'tbh_portfolio_dev' &&
    isolation?.portfolio === true && isolation.sandboxCredentialValidated === true &&
    isolation.provider === 'PostgreSQL' && isolation.database === 'tbh_portfolio_dev' &&
    isolation.returnUrl === 'https://127.0.0.1:55485/menu';
}
