# Set up Salesforce (optional)

Salesforce is the system of record in the story, but the app runs without it: the same fictional records already sit in the seed data. Do this when you want the accounts to exist in a real org and the console's record IDs to match it. About 10 minutes.

## 1. Get a Developer Edition org

Sign up at [developer.salesforce.com/signup](https://developer.salesforce.com/signup). It is free and separate from any work org.

## 2. Install the Salesforce CLI and sign in

Install from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli), then:

```bash
sf org login web --alias account-focus
```

A browser window opens; sign in to the Developer Edition org.

## 3. Load the fictional records

From the repo root:

```bash
sf apex run --file salesforce/seed.apex --target-org account-focus
```

This creates 25 accounts, 53 contacts, 4 opportunities and 1 case, all marked with **Site = Account Focus demo**. It is safe to re-run: it deletes only records with that marker first. Contacts carry their buying-role hypothesis in Description (`focus_role=champion`), and one has opted out of email.

If GTM Orbit's seed is in the same org, you will see two copies of some account names. They do not interfere: each project deletes only its own records.

## 4. Sync the real record IDs into Snowflake

```bash
scripts/export-salesforce.sh account-focus      # writes salesforce/exports/accounts.json (git-ignored)
cd app && npm run sync-sql                       # writes snowflake/08_sync_salesforce.sql (git-ignored)
```

Run `snowflake/08_sync_salesforce.sql` in Snowflake. It updates each account's Salesforce ID and reruns the engine. Without an org, `snowflake/08_sync_salesforce.sample.sql` does the same with the stand-in IDs.

## Why anonymous Apex and not the import wizard?

It loads accounts, contacts, opportunities and cases in one step with the right links between them, uses standard fields only (no custom objects to deploy), avoids field-level security surprises, and is repeatable.
