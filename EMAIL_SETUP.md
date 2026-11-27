# Customer account recovery email

JACOH sends customer password reset links through Gmail SMTP. Reset links expire after one hour and can only be used once.

## Configure Gmail SMTP

1. Use a dedicated Gmail account for JACOH.
2. Turn on 2-Step Verification for that Google account, then create an App Password for Mail. Google requires 2-Step Verification for App Passwords, and some managed or protected accounts do not offer them.
3. In the JACOH Vercel project, open **Settings → Environment Variables** and add these for **Production**:
   - `GMAIL_USER`: the complete Gmail address used to send reset messages.
   - `GMAIL_APP_PASSWORD`: the 16-character App Password. Store it as a **Secret**.
   - `APP_URL`: the public site origin, normally `https://jacoh.vercel.app`. This project already has this value set.
4. Merge the pull request and redeploy so the settings and code are active.

The sender will appear as **JACOH** using the Gmail address in `GMAIL_USER`. Do not use the regular Google account password, commit the App Password, or expose it in browser code. Google recommends OAuth 2.0 for new integrations; this setup uses an App Password for a simpler SMTP configuration. Gmail requires 2-Step Verification, and Google may block SMTP connections it considers unusual.

## Database setup

The migration was applied to the connected JACOH Supabase project. For a fresh database, apply [database/migrations/20261127_customer_cart_password_reset.sql](database/migrations/20261127_customer_cart_password_reset.sql) before deploying. It creates the account cart and password reset token tables with row-level security enabled and public API access revoked.
