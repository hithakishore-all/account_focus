-- Account Focus · 07 checks. Run after 01–06 to confirm everything is in place.
USE ROLE ACCOUNT_FOCUS_ADMIN;
USE WAREHOUSE ACCOUNT_FOCUS_WH;
USE SCHEMA ACCOUNT_FOCUS.CORE;

-- 1. Inputs loaded (expect 25 accounts, 61 signals, 53 contacts).
SELECT (SELECT COUNT(*) FROM AF_ACCOUNT) AS ACCOUNTS, (SELECT COUNT(*) FROM AF_SIGNAL) AS SIGNALS, (SELECT COUNT(*) FROM AF_CONTACT) AS CONTACTS,
       (SELECT COUNT(*) FROM AF_BACKTEST) AS BACKTEST_ROWS, (SELECT COUNT(*) FROM AF_SEGMENT) AS SEGMENTS;

-- 2. Run the engine (scripted wording works on trial accounts).
CALL SP_SCORE_ALL('scripted');

-- 3. Today's five. Expect Keystone, Pacific Crest, Meridian, Northstar and Juniper Ridge (exploration).
SELECT POSITION, ACCOUNT_NAME, MOTION, PRIORITY, READINESS, CONFIDENCE, ACTION, SLOT FROM V_BRIEF;

-- 4. The validator removed one uncited claim.
SELECT AT, EVENT, DETAIL FROM AF_AUDIT WHERE EVENT = 'CLAIM_REMOVED' ORDER BY AT DESC LIMIT 5;

-- 5. Optional: try Cortex wording (needs Cortex access; falls back to scripted wording on errors).
-- CALL SP_SCORE_ALL('cortex');
