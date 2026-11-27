# Customer account recovery email

JACOH sends customer password reset links through Resend. The reset link expires after one hour and can only be used once.

## Configure email delivery

1. Verify a sending domain in Resend and create an API key.
2. Add these environment variables to the JACOH deployment (for Vercel, add them to the project settings and redeploy):

   - `RESEND_API_KEY`: the Resend API key
   - `EMAIL_FROM`: a sender address on the verified domain, for example `JACOH <accounts@example.com>`
   - `APP_URL`: the public site origin, for example `https://jacoh.vercel.app`

The app defaults `APP_URL` to `https://jacoh.vercel.app`. Set it explicitly if the production domain changes. Keep `RESEND_API_KEY` server-side; do not add it to a `NEXT_PUBLIC_*` variable or client code.

## Database setup

Apply [database/migrations/20261127_customer_cart_password_reset.sql](database/migrations/20261127_customer_cart_password_reset.sql) to the Supabase database before deploying the app code. It creates the account cart and password reset token tables with row-level security enabled and public API access revoked.

