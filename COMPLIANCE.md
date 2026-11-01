# Regulatory & Responsible Gaming Compliance Notice (`COMPLIANCE.md`)

## 1. Mandatory Gaming License Requirement
Before deploying or operating this application for real-money wagering in any jurisdiction, **the operator MUST obtain a valid gaming/betting license from the competent regulatory authority** in the operating jurisdiction. No jurisdiction or country is hardcoded; operators are solely responsible for legal compliance, KYC/AML verification, and tax reporting in their territory.

## 2. Non-Negotiable Player Protections Implemented
- **Strict 18+ Age Gate**: Registration validates the player's date of birth (`dob`) on the server and rejects anyone under 18 years of age. Players must explicitly consent to the Terms & 18+ declaration (`terms_accepted_at`, `terms_version`).
- **Self-Exclusion (Server-Enforced)**: Players can activate self-exclusion breaks (24h, 7d, 30d, 90d, 365d). Self-exclusion is checked on every wagering and deposit API call on the server.
- **Daily Deposit Limits with Cooling-Off Delay**: Decreasing a daily deposit limit takes effect immediately. Increasing a daily deposit limit requires a mandatory 24-hour cooling-off delay (`pending_limit_minor`, `pending_limit_effective_at`).
- **Session-Time Reminders & Odds Disclosure**: Every room displays the exact ticket price, winning pattern, house fee percentage, and odds (`1 / tickets`), and players receive session-time reminders after 30 minutes.
- **Append-Only Integer Financial Ledger & Audit Trail**: All financial values are stored in integer minor units (santim/cents, never floating-point). Every deposit, withdrawal, ticket purchase, refund, payout, and admin action is recorded in `ledger_entries` and `audit_logs`.
