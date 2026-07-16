# Training signup deployment and verification

The public training page depends on both the CRM frontend and the `training-register` Supabase Edge Function. Deploy the backend first so a new frontend never points customers at a missing registration service.

## Production release order

1. Review and apply pending database migrations to project `jpvjqmkvtnedpmmrddft`.
2. Deploy `training-register` using the versioned configuration in `supabase/config.toml`.
3. Run `npm run check:training-signup` from the repository root. It verifies the public CORS preflight and health endpoint.
4. Only after the check succeeds, deploy the frontend to `https://crm.rd-palmer.my`.
5. Open a sales referral URL and perform one controlled registration. Confirm the registration and its salesperson attribution in CRM.

## Required production secrets

The Edge Function uses Supabase's built-in server credentials. If Turnstile is enabled, production must also contain:

- `TURNSTILE_SECRET_KEY`
- `TRAINING_SIGNUP_REQUIRE_CAPTCHA=true`
- optionally, `TRAINING_SIGNUP_ALLOWED_ORIGINS=https://crm.rd-palmer.my`

Do not put any secret or service-role key in the frontend or this repository.

## Failure handling

Every customer submission includes a request reference. The Edge Function returns it in the response and records non-sensitive success/failure events in its logs. Use that reference to trace a support case without asking the customer to repeatedly submit personal details.

The GitHub Actions workflow `.github/workflows/training-signup-smoke.yml` checks that the public endpoint remains available after changes. Configure it as an operational release check and investigate any failure before sharing sales links.
