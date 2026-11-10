# Set up Snowflake (live mode)

About 15 minutes. You need a Snowflake account where you can use ACCOUNTADMIN (a [free trial](https://signup.snowflake.com/) works). Offline mode needs none of this.

## 1. Open a worksheet

In Snowsight: **Projects → Workspaces** (or **Worksheets**) → new SQL file. Set the role to **ACCOUNTADMIN**.

## 2. Create the database, warehouse and roles

Paste and run `snowflake/01_setup.sql`. It creates role `ACCOUNT_FOCUS_ADMIN`, warehouse `ACCOUNT_FOCUS_WH` (X-Small, suspends after 60 s), database `ACCOUNT_FOCUS` and schema `CORE`.

## 3. Create tables and views, then load the data

Run, in order:

1. `snowflake/02_tables.sql`
2. `snowflake/03_views.sql`
3. `snowflake/04_seed.sql` (fictional data; about 400 KB, takes a few seconds)
4. `snowflake/05_engine.sql` (the scoring procedure and a suspended nightly task)

## 4. Run the engine and check the result

Run `snowflake/07_checks.sql`. Expect 25 accounts, then a brief of Keystone, Pacific Crest, Meridian, Northstar and Juniper Ridge, and one `CLAIM_REMOVED` event.

To try Cortex wording instead of scripted wording: `CALL ACCOUNT_FOCUS.CORE.SP_SCORE_ALL('cortex');`. If your account cannot use Cortex, the run still completes, falls back to scripted wording and logs `MODEL_FALLBACK`.

## 5. Create a key pair for the app

On your computer, in the `app` folder:

```bash
mkdir -p .keys
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out .keys/rsa_key.p8 -nocrypt
openssl rsa -in .keys/rsa_key.p8 -pubout -out .keys/rsa_key.pub
grep -v "PUBLIC KEY" .keys/rsa_key.pub | tr -d '\n' | pbcopy   # macOS: copies the key body
```

On Windows or Linux, open `.keys/rsa_key.pub`, and copy the lines between `BEGIN` and `END` as one line.

## 6. Create the service user and fill in .env

1. Open `snowflake/06_service_user.sql`, replace `PASTE_PUBLIC_KEY_BODY_HERE` with what you copied, and run it as ACCOUNTADMIN.
2. Find your account identifier: in Snowsight, click your name → **Connect a tool to Snowflake** → copy **Account identifier** (looks like `ORGNAME-ACCOUNTNAME`).
3. In `app/`, run `cp .env.example .env` and set:

```
SNOWFLAKE_ACCOUNT=ORGNAME-ACCOUNTNAME
SNOWFLAKE_USER=ACCOUNT_FOCUS_SVC
SNOWFLAKE_PRIVATE_KEY_PATH=.keys/rsa_key.p8
```

## 7. Start in live mode

```bash
cd app && npm start
```

The badge in the top right reads **Live · Snowflake**. Decisions you make now land in `AF_FEEDBACK`; check with `SELECT * FROM ACCOUNT_FOCUS.CORE.V_BRIEF;`.

## Optional: run it every morning

```sql
ALTER TASK ACCOUNT_FOCUS.CORE.AF_NIGHTLY RESUME;   -- 06:00 Pacific, weekdays
```

The demo date stays pinned to 9 Nov 2026 until you change it: `UPDATE ACCOUNT_FOCUS.CORE.AF_CONFIG SET V = TO_VARCHAR(CURRENT_DATE()) WHERE K = 'demo_today';`

## Remove everything

```sql
USE ROLE ACCOUNTADMIN;
DROP DATABASE IF EXISTS ACCOUNT_FOCUS; DROP WAREHOUSE IF EXISTS ACCOUNT_FOCUS_WH;
DROP USER IF EXISTS ACCOUNT_FOCUS_SVC; DROP ROLE IF EXISTS ACCOUNT_FOCUS_APP; DROP ROLE IF EXISTS ACCOUNT_FOCUS_ADMIN;
```
