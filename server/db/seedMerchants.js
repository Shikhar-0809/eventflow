// Merchant ids used by the dev seeds. Merchant 1 is created by migration 002 (Bala Ji Tent House);
// all existing demo data belongs to it. Merchant 2 is a dev-only second tenant (devMerchantSeed.js)
// so cross-merchant bugs are visible locally.
export const PRIMARY_MERCHANT_ID = 1

// Demo logins for the dev seed (seed.js). Fictional businesses and a published demo password, so anyone
// running the app locally can log in. seed() never runs in production, so these accounts only exist on
// dev databases. Verify scripts log in as the first one.
export const DEMO_PASSWORD = 'EventFlowDemo#2026' // nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_password -- dev-only seed, skipped when NODE_ENV is production
export const DEMO_MERCHANTS = [
  { business_name: 'Bala Ji Tent House', email: 'balaji@demo.eventflow.example' },
  { business_name: 'Shree Ganesh Caterers', email: 'shreeganesh@demo.eventflow.example' },
]
