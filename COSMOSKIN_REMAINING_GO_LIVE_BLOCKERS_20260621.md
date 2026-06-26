# COSMOSKIN Remaining Go-Live Blockers — 2026-06-21

## Blocking before real paid orders

- Production Cloudflare secrets are not included and must be configured manually.
- Supabase production migrations must be applied and verified against the real database.
- iyzico agreement/credentials must be configured and sandbox tests must pass before card payments are enabled.
- Real commercial bank account must be configured and verified before EFT/Havale is enabled.
- Admin routes must be protected with Cloudflare Access/MFA in production.
- Expired inventory reservation cron must be configured with bearer secret.
- Lawyer, financial advisor/accountant and KVKK consultant review is still required.

## Business information still needed

- Final KEP address
- Final ETBİS registration
- Final DHL return cargo code
- Final iyzico merchant confirmation
- Final bank transfer details, if EFT/Havale will be used
- Final e-Fatura/e-Arşiv provider
- Final tax number publication decision
- Final public address publication decision
- İYS status if marketing emails/SMS will be sent
- Final return cargo fee wording approved by advisor/lawyer
