#!/usr/bin/env python3
"""Generate every Account Focus seed file from one source of truth.

All companies, people and numbers are fictional. Emails use the .example domain.
The 25 accounts are the same fictional book GTM Orbit uses (owner: Alex Rivera at Acme),
so the two prototypes share one world.

Run:  python3 data/generate_data.py
Writes:
  data/seed/*.json            raw inputs for the scoring engine (offline and Snowflake)
  data/seed/gong_segments.jsonl  labelled call segments for the extraction check
  data/seed/backtest.csv      synthetic weekly history for the ranking backtest
  salesforce/seed.apex        anonymous Apex that creates the CRM records
  snowflake/04_seed.sql       loads the same inputs into Snowflake
The output is deterministic: running it twice produces identical files.
"""
import csv, json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "data", "seed")
TODAY = "2026-11-09"
OWNER = {"id": "005ORB000000001AAA", "name": "Alex Rivera", "email": "ae@acme.example", "slack_handle": "alex.rivera"}
SELLER = {"company": "Acme", "domain": "acme.example"}

# ---------------------------------------------------------------- accounts
# fit, whitespace and alignment are 0-100 inputs to Attractiveness.
ACCOUNTS = [
 # key, name, industry, region, employees, type, motion, baseline, baseline_age, fit, whitespace, alignment
 ("GTM-0024","Keystone Elevator Services","Machinery","NA",4200,"Prospect","New logo",0.85,0,88,82,80),
 ("GTM-0001","Northstar Field Services","Consulting","NA",1800,"Customer","Expansion",0.87,0,84,78,76),
 ("GTM-0011","Pacific Crest Home Services","Construction","NA",2600,"Prospect","New logo",0.84,0,80,76,78),
 ("GTM-0012","Meridian Senior Living","Healthcare","NA",3100,"Customer","Renewal risk",0.79,0,78,70,80),
 ("GTM-0002","Juniper Ridge Health","Healthcare","EMEA",5400,"Customer","Expansion",0.81,1,82,90,72),
 ("GTM-0019","Heartland Foodservice Distributors","Food & Beverage","NA",2200,"Customer","Expansion",0.77,0,72,70,66),
 ("GTM-0003","Cobalt Ledger Systems","Finance","NA",900,"Customer","Expansion",0.76,6,74,70,70),
 ("GTM-0017","Copperline Fiber Services","Telecommunications","NA",1300,"Prospect","New logo",0.83,0,78,72,68),
 ("GTM-0007","Quarry & Pine Manufacturing","Machinery","NA",None,"Prospect","New logo",None,None,None,None,None),
 ("GTM-0010","Kestrel Biotech","Biotechnology","EMEA",140,"Prospect","New logo",0.41,4,22,30,36),
 # the rest of the book: fit/whitespace/alignment filled by the RNG below
 ("GTM-0013","Ironbridge Construction Group","Construction","NA",1500,"Prospect","New logo",0.74,1,None,None,None),
 ("GTM-0016","Lakeshore Regional Medical Center","Healthcare","NA",2900,"Prospect","New logo",0.73,5,None,None,None),
 ("GTM-0005","Verdant Grid Energy","Energy","EMEA",3600,"Customer","Expansion",0.72,2,None,None,None),
 ("GTM-0014","Summit Valley Credit Union","Banking","NA",700,"Prospect","New logo",0.71,2,None,None,None),
 ("GTM-0021","Harbor Point Hospitality Group","Hospitality","NA",2400,"Prospect","New logo",0.70,0,None,None,None),
 ("GTM-0004","Harborline Logistics","Transportation","NA",3300,"Customer","Expansion",0.69,0,None,None,None),
 ("GTM-0015","Granite State Utilities","Utilities","NA",1900,"Prospect","New logo",0.68,0,None,None,None),
 ("GTM-0023","Atlas Fleet Maintenance","Transportation","NA",1100,"Customer","Expansion",0.67,0,None,None,None),
 ("GTM-0009","Brightwater Insurance","Insurance","NA",2100,"Prospect","New logo",0.66,1,None,None,None),
 ("GTM-0018","Bayview Property Management","Other","NA",600,"Customer","Expansion",0.64,0,None,None,None),
 ("GTM-0008","Lumen Arc Media","Media","NA",800,"Prospect","New logo",0.63,0,None,None,None),
 ("GTM-0020","Cascade Water District","Government","NA",450,"Prospect","New logo",0.61,1,None,None,None),
 ("GTM-0006","Tessellate Retail Group","Retail","APAC",5200,"Customer","Expansion",0.58,3,None,None,None),
 ("GTM-0025","Southern Cross Facilities Group","Consulting","APAC",1400,"Prospect","New logo",0.57,0,None,None,None),
 ("GTM-0022","Thameside Veterinary Partners","Healthcare","EMEA",650,"Prospect","New logo",0.44,2,None,None,None),
]

def sig(ref, acct, side, source, family, typ, date, text, strength, speaker=None, speaker_side=None,
        matched=True, event=None, polarity="buy", themes=None, extra=None):
    d = {"ref": ref, "account": acct, "side": side, "source": source, "family": family, "type": typ,
         "date": date, "text": text, "strength": strength, "speaker": speaker, "speaker_side": speaker_side,
         "speaker_matched": matched, "event": event or ref, "polarity": polarity, "themes": themes or []}
    if extra: d.update(extra)
    return d

SIGNALS = [
 # Keystone: hero run
 sig("GONG-9120#4","GTM-0024","inside","Gong","gong_buying","Budget","2026-11-04",'"We have budget set aside for this in Q1 if the numbers hold up."',0.9,"Dana Whitfield, CFO","customer",event="KEY-BUDGET"),
 sig("GONG-9120#7","GTM-0024","inside","Gong","gong_buying","Timeline","2026-11-04",'"We want every technician on one schedule before the spring maintenance season."',0.7,"Luis Ortega, VP Service Operations","customer",event="KEY-TIMELINE",themes=["consolidation"]),
 sig("SF-OPP-006ORB000000031AAA","GTM-0024","inside","Salesforce","opportunity","New opportunity","2026-11-05","Keystone · Service Scheduling Platform · Discovery · $240,000",0.8,event="KEY-BUDGET"),
 sig("PUB-ER-0024-Q3","GTM-0024","outside","Public","strategy","Stated strategy","2026-10-28",'"We are launching a program to take 12% out of service delivery cost by the end of 2027." (CEO, Q3 earnings call)',0.8,themes=["cost"]),
 sig("PUB-NEWS-0024-01","GTM-0024","outside","Public","exec_change","Executive change","2026-09-22","Keystone names Dana Whitfield Chief Financial Officer.",0.9,extra={"exec_name":"Dana Whitfield"}),
 sig("SF-OPP-006ORB000000019AAA","GTM-0024","inside","Salesforce","opportunity","Closed lost","2024-08-15","Keystone · Scheduling Pilot · Closed Lost · lost to an incumbent on price",0.0),
 sig("INTENT-0024-TECH_SCHEDULING","GTM-0024","outside","Intent","intent","Research intent","2026-11-01",'"technician scheduling" at 74/100, up from 41 four weeks earlier.',0.6),
 # Northstar: hot account, wrong people (quotes match GTM Orbit's fixtures)
 sig("GONG-8812#2","GTM-0001","inside","Gong","gong_buying","Pain","2026-10-14",'"We\'re running three different scheduling tools across our field regions. It\'s a mess for dispatch."',0.8,"Riley Chen, Director Field Operations","customer",event="NS-PAIN",themes=["consolidation"]),
 sig("GONG-8812#3","GTM-0001","inside","Gong","gong_buying","Priority alignment","2026-10-14",'"The goal is to consolidate scheduling onto one platform and keep dispatch data in one place."',0.8,"Riley Chen, Director Field Operations","customer",event="NS-PAIN",themes=["consolidation"]),
 sig("GONG-8812#6","GTM-0001","inside","Gong","gong_buying","Timeline","2026-10-14",'"Jordan wants a decision before Q1 planning closes."',0.9,"Riley Chen, Director Field Operations","customer",event="NS-TIMELINE"),
 sig("GONG-8812#4","GTM-0001","inside","Gong","gong_buying","Objection","2026-10-14",'"The big question is integration. Our dispatch system has to stay the source for job status."',0.3,"Riley Chen, Director Field Operations","customer",event="NS-OBJECTION"),
 sig("SF-OPP-006ORB000000002AAA","GTM-0001","inside","Salesforce","opportunity","Opportunity","2026-10-23","Regional Scheduling Expansion · Qualification · $185,000 · next step: confirm technical evaluator",0.8,event="NS-TIMELINE",extra={"pitch":"expansion","next_step_open_days":17}),
 sig("INTENT-0001-FIELD_SERVICE_SCHEDULING","GTM-0001","outside","Intent","intent","Research intent","2026-10-19",'"field service scheduling" at 70/100, up from 48 four weeks earlier.',0.6,event="NS-PAIN"),
 # Pacific Crest: contradiction
 sig("PUB-LTR-0011-2026","GTM-0011","outside","Public","strategy","Stated strategy","2026-10-20",'"We will consolidate from 14 field-software vendors to 5 by 2028." (Marcus Bell, CEO, shareholder letter)',0.9,event="PC-CONSOL",themes=["consolidation"]),
 sig("GONG-9033#5","GTM-0011","inside","Gong","gong_buying","Process","2026-11-03",'"Procurement now wants every new tool to replace at least one we already pay for."',0.8,"Ana Ruiz, Procurement Manager","customer",event="PC-CONSOL",themes=["consolidation"]),
 sig("GONG-9033#2","GTM-0011","inside","Gong","gong_buying","Pain","2026-11-03",'"Our techs log into four apps before the first job."',0.8,"Tom Becker, Director Operations","customer",event="PC-PAIN"),
 sig("SF-OPP-006ORB000000044AAA","GTM-0011","inside","Salesforce","opportunity","Opportunity","2026-10-30","Pacific Crest · Dispatch Add-on · Proposal · $90,000",0.7,event="PC-OPP",extra={"pitch":"add-on"}),
 # Meridian: rescue
 sig("USAGE-0012-WAU","GTM-0012","inside","Usage","usage","Usage drop","2026-11-07","Weekly active schedulers down 31% in 60 days (212 to 146).",0.9,polarity="risk"),
 sig("SF-CASE-00001044","GTM-0012","inside","Salesforce","engagement","Open escalation","2026-10-29",'Case · High priority · "Shift swap sync failing for night staff" · open 11 days',0.7,polarity="risk"),
 sig("GONG-8790#9","GTM-0012","inside","Gong","gong_buying","Commitment","2026-09-23",'"Let\'s do a full review with my regional directors in October."',0.6,"Hannah Cole, Director Clinical Operations","customer",polarity="risk",extra={"commitment_fulfilled":False}),
 sig("SF-CTR-00000412","GTM-0012","inside","Salesforce","renewal","Renewal","2026-11-09","Contract renews 1 Feb 2027 · $310,000 ARR",0.8,polarity="risk",extra={"renewal_date":"2027-02-01"}),
 sig("PUB-NEWS-0012-01","GTM-0012","outside","Public","exec_change","Reorganization","2026-10-15","Meridian reorganizes regional operations into three divisions.",0.6,polarity="risk"),
 # Juniper Ridge: new exec, exploration
 sig("PUB-NEWS-0002-01","GTM-0002","outside","Public","exec_change","Executive change","2026-10-02","Juniper Ridge Health appoints Priya Nandakumar as Chief Information Officer.",0.9,extra={"exec_name":"Priya Nandakumar"}),
 sig("PUB-JOBS-0002","GTM-0002","outside","Public","hiring","Hiring","2026-10-20",'3 open roles for "Field Clinical Scheduling Analyst" across two regions.',0.8),
 # Heartland: usage expansion
 sig("USAGE-0019-SEATS","GTM-0019","inside","Usage","usage","Seat ceiling","2026-11-06","288 of 300 seats in use (96%).",0.9),
 sig("GONG-9101#3","GTM-0019","inside","Gong","gong_buying","Expansion","2026-10-27",'"The Midwest depots want in after the pilot."',0.7,"Greg Tanner, VP Distribution","customer"),
 # Cobalt: stale data, unmatched speaker
 sig("GONG-8981#2","GTM-0003","inside","Gong","gong_buying","Interest","2026-10-30",'"We\'d like to see the reporting module for the audit team."',0.7,'"Chris M." (not matched to a CRM contact)',"customer",matched=False),
 sig("GONG-8981#5","GTM-0003","inside","Gong","gong_buying","Timeline","2026-10-30",'"If it works we would want it before year-end close."',0.6,'"Chris M." (not matched to a CRM contact)',"customer",matched=False),
 # Copperline: tracker trap
 sig("GONG-8955#3","GTM-0017","inside","Gong","gong_buying","Tracker: Budget","2026-10-21",'"Do you have budget allocated for this year?" (one of 9 budget and pricing tracker hits, all spoken by Acme)',0.8,"Alex Rivera, Acme","seller",extra={"tracker_hits":9}),
 sig("GONG-8955#6","GTM-0017","inside","Gong","gong_buying","Timing risk","2026-10-21",'"We\'re not looking at anything new until the network build finishes next summer."',-0.8,"Nina Park, Network Operations Lead","customer"),
 # Kestrel: nothing recent
 sig("SF-ACC-001ORB000000010AAA","GTM-0010","inside","Salesforce","firmographic","Firmographics","2026-07-02","140 employees · lab operations · no field technicians.",0.0),
 # Quarry & Pine: missing data
 sig("SF-ACC-001ORB000000007AAA","GTM-0007","inside","Salesforce","firmographic","Missing data","2026-05-12","No employee count, no baseline score, 1 contact with no title.",0.0),
]

def con(acct, cid, name, title, role, last_engaged, opted_out=False, dnc=False, email=True):
    first, last = name.lower().split(" ")[0], name.lower().split(" ")[-1]
    dom = {"GTM-0024":"keystoneelevator","GTM-0001":"northstarfield","GTM-0011":"pacificcresthome","GTM-0012":"meridianseniorliving",
           "GTM-0002":"juniperridgehealth","GTM-0019":"heartlandfoods","GTM-0003":"cobaltledger","GTM-0017":"copperlinefiber",
           "GTM-0010":"kestrelbio","GTM-0007":"quarrypine"}.get(acct, acct.lower())
    return {"id": cid, "account": acct, "name": name, "title": title, "role": role,
            "email": f"{first}.{last}@{dom}.example" if email else None,
            "last_engaged": last_engaged, "opted_out": opted_out, "do_not_call": dnc}

CONTACTS = [
 con("GTM-0024","003ORB000000081AAA","Dana Whitfield","CFO","economic_buyer","2026-11-04"),
 con("GTM-0024","003ORB000000082AAA","Luis Ortega","VP Service Operations","champion","2026-11-04"),
 con("GTM-0024","003ORB000000083AAA","Sam Okafor","IT Director","technical_evaluator","2026-10-30"),
 con("GTM-0024","003ORB000000088AAA","Renee Albright","COO","executive_sponsor",None),
 con("GTM-0001","003ORB000000001AAA","Riley Chen","Director, Field Operations","champion","2026-10-14"),
 con("GTM-0001","003ORB000000002AAA","Jordan Patel","VP, Business Systems","executive_sponsor",None),
 con("GTM-0001","003ORB000000003AAA","Morgan Ellis","Operations Manager","champion",None,opted_out=True),
 con("GTM-0011","003ORB000000111AAA","Tom Becker","Director, Operations","champion","2026-11-03"),
 con("GTM-0011","003ORB000000112AAA","Kevin Osei","IT Manager","technical_evaluator","2026-10-27"),
 con("GTM-0011","003ORB000000113AAA","Grace Liu","CFO","economic_buyer",None),
 con("GTM-0011","003ORB000000114AAA","Ana Ruiz","Procurement Manager",None,"2026-11-03"),
 con("GTM-0012","003ORB000000121AAA","Hannah Cole","Director, Clinical Operations","champion","2026-09-23"),
 con("GTM-0012","003ORB000000122AAA","Paul Hartley","CFO","economic_buyer","2026-06-10"),
 con("GTM-0012","003ORB000000123AAA","Irene Vos","IT Lead","technical_evaluator","2026-08-18"),
 con("GTM-0012","003ORB000000124AAA","Daniel Shore","COO","executive_sponsor","2026-05-20"),
 con("GTM-0002","003ORB000000021AAA","Tomás Ferreira","Scheduling Manager","champion","2026-08-12"),
 con("GTM-0002","003ORB000000022AAA","Elena Rossi","Head of Homecare Operations","executive_sponsor","2026-08-30"),
 con("GTM-0019","003ORB000000191AAA","Greg Tanner","VP Distribution","champion","2026-10-27"),
 con("GTM-0019","003ORB000000192AAA","Ray Kim","IT Director","technical_evaluator","2026-10-30"),
 con("GTM-0019","003ORB000000193AAA","Lisa Grant","CFO","economic_buyer","2026-07-15"),
 con("GTM-0019","003ORB000000194AAA","Ann Doyle","COO","executive_sponsor","2026-06-02"),
 con("GTM-0003","003ORB000000031AAA","Ivy Lam","Systems Analyst","technical_evaluator","2026-09-02"),
 con("GTM-0003","003ORB000000032AAA","Chris Moreno","Controller",None,None),
 con("GTM-0017","003ORB000000171AAA","Nina Park","Network Operations Lead","champion","2026-10-21"),
 con("GTM-0010","003ORB000000101AAA","Owen Hale","Lab Manager","champion","2026-04-08"),
 con("GTM-0007","003ORB000000071AAA","Pat Quinn","",None,None,email=False),
]

# Scripted agent wording (MODEL=scripted). Each sentence carries the evidence refs that support it.
# The Keystone draft deliberately includes one uncited sentence: the validator removes it.
DRAFTS = {
 "GTM-0024": {"why_now": [
   {"text": "Dana Whitfield, CFO for seven weeks, said budget is set aside for Q1 on the Nov 4 call, a week after the CEO announced a 12% service-cost program.", "refs": ["GONG-9120#4","PUB-ER-0024-Q3","PUB-NEWS-0024-01"]},
   {"text": "Keystone is moving off its current scheduling vendor this quarter.", "refs": []}],
   "action": {"title": "Request an executive meeting with Dana Whitfield", "who": "Dana Whitfield, CFO · with Luis Ortega", "due": "2026-11-12",
     "points": ["Tie one technician schedule to the 12% service-cost program", "Bring the Bluepeak Utilities overtime result", "Ask to include COO Renee Albright"]}},
 "GTM-0001": {"why_now": [
   {"text": "Riley Chen says Jordan Patel wants a decision before Q1 planning closes, but nobody who owns the budget or the dispatch integration has joined a call.", "refs": ["GONG-8812#6","GONG-8812#4","SF-OPP-006ORB000000002AAA"]}],
   "action": {"title": "Ask Riley to bring in the budget owner and the dispatch owner", "who": "Riley Chen, Director Field Operations", "due": "2026-11-13",
     "points": ["Offer a 30-minute dispatch integration review for their system owner", "Ask who signs off on the $185,000 before Q1 planning closes", "Invite Jordan Patel; he is named on calls but has never attended"]}},
 "GTM-0011": {"why_now": [
   {"text": "The CEO committed to cutting field-software vendors from 14 to 5, and procurement now wants every new tool to replace one, yet our open proposal is a $90,000 add-on.", "refs": ["PUB-LTR-0011-2026","GONG-9033#5","SF-OPP-006ORB000000044AAA"]}],
   "action": {"title": "Reframe the proposal as a consolidation before procurement reviews it", "who": "Tom Becker, Director Operations", "due": "2026-11-14",
     "points": ["Map which of the 14 vendors Acme replaces, by name", "Show logins removed per technician per day", "Resubmit as a replacement and ask Tom to bring in CFO Grace Liu"]}},
 "GTM-0012": {"why_now": [
   {"text": "Champion Hannah Cole has been silent for 47 days, weekly active schedulers fell 31%, and the $310,000 renewal is 84 days away.", "refs": ["GONG-8790#9","USAGE-0012-WAU","SF-CTR-00000412"]}],
   "action": {"title": "Re-engage Hannah Cole with a fix-first note, then propose the review", "who": "Hannah Cole · copy the customer success manager", "due": "2026-11-11",
     "points": ["Lead with the fix date for the night-staff shift swap case", "Ask how the new three-division structure changes her team", "Propose the regional directors review she offered in September"]}},
 "GTM-0002": {"why_now": [
   {"text": "A new CIO, Priya Nandakumar, started 38 days ago and the company is hiring clinical scheduling analysts, but nobody at Acme has met her.", "refs": ["PUB-NEWS-0002-01","PUB-JOBS-0002"]}],
   "action": {"title": "Ask Elena Rossi for an introduction to the new CIO", "who": "Elena Rossi, Head of Homecare Operations", "due": "2026-11-16",
     "points": ["Share homecare results Elena can bring to the CIO", "Ask what Priya Nandakumar is prioritising in her first 90 days", "Offer a short briefing on scheduling across all five divisions"]}},
 "GTM-0019": {"why_now": [
   {"text": "Seats are at 96% of contract and the Midwest depots asked to join after the pilot.", "refs": ["USAGE-0019-SEATS","GONG-9101#3"]}],
   "action": {"title": "Propose seats for the Midwest depots", "who": "Greg Tanner, VP Distribution", "due": "2026-11-17",
     "points": ["Show the 96% seat use", "Price the Midwest depots as one add-on", "Ask Greg to bring in CFO Lisa Grant"]}},
 "GTM-0003": {"why_now": [
   {"text": "Someone asked for the reporting module before year-end close, but the speaker is not matched to any CRM contact and the baseline score is 6 days old.", "refs": ["GONG-8981#2","GONG-8981#5"]}],
   "action": {"title": "Confirm who \"Chris M.\" is and refresh the score", "who": "You · about 10 minutes", "due": "2026-11-10",
     "points": ["Check the Oct 30 call participants", "Link the speaker to a CRM contact (likely Chris Moreno, Controller)", "The account is rescored within the hour after the fix"]}},
 "GTM-0017": {"why_now": [
   {"text": "All 9 budget and pricing tracker hits were questions asked by our side, and the customer said nothing new is moving until the network build finishes next summer.", "refs": ["GONG-8955#3","GONG-8955#6"]}],
   "action": {"title": "Set a watch for the network build finishing", "who": "Rescore on a new budget or executive event", "due": None,
     "points": ["Revisit in Q2 2027", "Rescore automatically on a new executive or funding event"]}},
 "GTM-0010": {"why_now": [
   {"text": "140 employees and no field service operations put Kestrel outside the ideal customer profile.", "refs": ["SF-ACC-001ORB000000010AAA"]}],
   "action": {"title": "Skip this account for now", "who": "No action needed", "due": None, "points": ["Rescore only if field operations appear"]}},
 "GTM-0007": {"why_now": [
   {"text": "Not scored: there is no employee count, no baseline score and only one contact with no title.", "refs": ["SF-ACC-001ORB000000007AAA"]}],
   "action": {"title": "Fill in the basics so it can be scored", "who": "You or your SDR", "due": None,
     "points": ["Add employee count and industry", "Find one operations leader", "The account is rescored within the hour"]}},
}

PREP = {
 "GTM-0024": {"exec": "Dana Whitfield, CFO", "contact": "003ORB000000081AAA",
   "pov": {"text": "We believe split technician schedules are costing Keystone overtime and drive time it needs back for the 12% program, because each region plans crews in its own tool.", "refs": ["PUB-ER-0024-Q3","GONG-9120#7"]},
   "priorities": [{"text": "Take 12% out of service delivery cost by the end of 2027", "vis": "public", "ref": "PUB-ER-0024-Q3"},
                  {"text": "Every technician on one schedule before the spring season", "vis": "internal", "ref": "GONG-9120#7"},
                  {"text": "Fund the change in Q1 if the numbers hold", "vis": "internal", "ref": "GONG-9120#4"}],
   "questions": ["Which cost lines does the 12% program measure first: overtime, drive time or subcontractors?",
                 "What would \"the numbers hold up\" need to show for a Q1 decision?", "Who else signs off on a cross-region tool change?"],
   "proof": "PP-BLUEPEAK",
   "landmines": [{"text": "Keystone chose an incumbent over Acme on price in 2024", "vis": "internal", "ref": "SF-OPP-006ORB000000019AAA"},
                 {"text": "The Q1 budget remark was made on a private call; do not quote it back as public", "vis": "internal", "ref": "GONG-9120#4"}],
   "ask": "A 45-minute working session with Dana and Luis to size overtime savings for the Q1 business case."},
 "GTM-0001": {"exec": "Jordan Patel, VP Business Systems", "contact": "003ORB000000002AAA",
   "pov": {"text": "We believe three regional scheduling tools are slowing Northstar's dispatch, and one platform that keeps dispatch as the source of job status removes that without a risky migration.", "refs": ["GONG-8812#2","GONG-8812#4"]},
   "priorities": [{"text": "Consolidate scheduling onto one platform", "vis": "internal", "ref": "GONG-8812#3"},
                  {"text": "Keep dispatch the source for job status", "vis": "internal", "ref": "GONG-8812#4"},
                  {"text": "Decide before Q1 planning closes", "vis": "internal", "ref": "GONG-8812#6"}],
   "questions": ["What has to be true about the dispatch integration for you to sign off?", "Who owns the budget for the regional rollout?",
                 "What did the second-region rollout teach you about adoption?"],
   "proof": "PP-HARROW",
   "landmines": [{"text": "Morgan Ellis opted out of email; do not copy them", "vis": "internal", "ref": "SF-CON-003ORB000000003AAA"}],
   "ask": "A dispatch integration review with your system owner next week."},
 "GTM-0011": {"exec": "Marcus Bell, CEO", "contact": None,
   "pov": {"text": "We believe Pacific Crest can reach its 14-to-5 vendor goal faster if scheduling, dispatch sync and job notes come off three tools and onto one.", "refs": ["PUB-LTR-0011-2026","GONG-9033#2"]},
   "priorities": [{"text": "Consolidate from 14 field-software vendors to 5 by 2028", "vis": "public", "ref": "PUB-LTR-0011-2026"},
                  {"text": "Every new tool replaces one already paid for", "vis": "internal", "ref": "GONG-9033#5"},
                  {"text": "Fewer apps for technicians before the first job", "vis": "internal", "ref": "GONG-9033#2"}],
   "questions": ["Which vendor categories are first in line for consolidation?", "How will you measure the consolidation: contracts, spend or technician time?",
                 "Who decides which tools survive?"],
   "proof": "PP-BLUEPEAK3",
   "landmines": [{"text": "Our open proposal is an add-on; lead with replacement, not with that proposal", "vis": "internal", "ref": "SF-OPP-006ORB000000044AAA"}],
   "ask": "Agree a two-week replacement assessment with Tom Becker's team."},
}

CATALOG = {
 "value_props": [
  {"id": "VP-ONE-SCHEDULE", "text": "One schedule for every technician cuts drive time and overtime", "themes": ["cost", "consolidation"]},
  {"id": "VP-DISPATCH-CONNECT", "text": "Dispatch Connect syncs job status both ways; your dispatch system stays the system of record", "themes": ["integration"]},
  {"id": "VP-REPLACE", "text": "Scheduling, dispatch sync and job notes in one platform, with named tools retired", "themes": ["consolidation"]},
  {"id": "VP-SCALE", "text": "Scale scheduling from one division to many without new tools", "themes": ["growth"]}],
 "proof_points": [
  {"id": "PP-BLUEPEAK", "text": "Bluepeak Utilities (fictional): overtime down 18% in two quarters after moving 600 technicians to one schedule."},
  {"id": "PP-BLUEPEAK3", "text": "Bluepeak Utilities (fictional): retired three field tools in one quarter."},
  {"id": "PP-HARROW", "text": "Harrow Lifts (fictional): connected to their dispatch system and live across 4 regions in 9 weeks."}]
}

VALUEMAP = [
 {"account": "GTM-0024", "priority": "Take 12% out of service delivery cost by end of 2027", "ref": "PUB-ER-0024-Q3", "vis": "public", "value_prop": "VP-ONE-SCHEDULE", "proof": "PP-BLUEPEAK", "inside": "GONG-9120#7"},
 {"account": "GTM-0024", "priority": "Fund the change in Q1 if the numbers hold", "ref": "GONG-9120#4", "vis": "internal", "value_prop": "VP-ONE-SCHEDULE", "proof": "PP-BLUEPEAK", "inside": "SF-OPP-006ORB000000031AAA"},
 {"account": "GTM-0001", "priority": "Consolidate scheduling onto one platform", "ref": "GONG-8812#3", "vis": "internal", "value_prop": "VP-REPLACE", "proof": "PP-BLUEPEAK3", "inside": "GONG-8812#2"},
 {"account": "GTM-0001", "priority": "Dispatch stays the source for job status", "ref": "GONG-8812#4", "vis": "internal", "value_prop": "VP-DISPATCH-CONNECT", "proof": "PP-HARROW", "inside": "SF-OPP-006ORB000000002AAA"},
 {"account": "GTM-0011", "priority": "Consolidate from 14 field-software vendors to 5", "ref": "PUB-LTR-0011-2026", "vis": "public", "value_prop": "VP-REPLACE", "proof": "PP-BLUEPEAK3", "inside": "GONG-9033#2"},
 {"account": "GTM-0011", "priority": "Every new tool must replace one", "ref": "GONG-9033#5", "vis": "internal", "value_prop": "VP-REPLACE", "proof": "PP-BLUEPEAK3", "inside": "SF-OPP-006ORB000000044AAA"},
 {"account": "GTM-0002", "priority": "Hiring for clinical field scheduling", "ref": "PUB-JOBS-0002", "vis": "public", "value_prop": "VP-SCALE", "proof": "PP-BLUEPEAK3", "inside": None},
]

FIRST = ["Avery","Blake","Casey","Devon","Emery","Finley","Harper","Jamie","Kendall","Logan","Morgan","Parker","Quinn","Reese","Rowan","Sage","Skyler","Taylor"]
LAST = ["Abbott","Brooks","Castillo","Dunn","Ellison","Foster","Garcia","Hughes","Ibarra","Jensen","Khan","Lowe","Mendes","Nolan","Ortiz","Price","Ramos","Shah"]
TITLES = {"economic_buyer": "CFO", "champion": "Director of Operations", "technical_evaluator": "IT Manager", "executive_sponsor": "COO"}

def fill_rest(rng):
    """Light, plausible data for the 15 accounts outside the hero set."""
    rows = []
    for i, a in enumerate(ACCOUNTS):
        if a[9] is not None or a[0] == "GTM-0007":
            rows.append(list(a)); continue
        r = list(a)
        r[9], r[10], r[11] = rng.randint(48, 76), rng.randint(40, 72), rng.randint(40, 70)
        rows.append(r)
        key = r[0]
        n = rng.randint(1, 3)
        for j in range(n):
            days = rng.randint(12, 70)
            date = shift(TODAY, -days)
            kind = rng.choice(["engagement", "intent", "hiring"])
            text = {"engagement": "Opened the field scheduling guide and attended a webinar.",
                    "intent": f'"workforce scheduling" at {rng.randint(45, 62)}/100.',
                    "hiring": f"{rng.randint(1, 3)} open operations roles posted."}[kind]
            SIGNALS.append(sig(f"{'ENG' if kind=='engagement' else 'INTENT' if kind=='intent' else 'PUB-JOBS'}-{key[4:]}-{j+1}", key,
                               "inside" if kind == "engagement" else "outside",
                               "Salesforce" if kind == "engagement" else "Intent" if kind == "intent" else "Public",
                               kind, kind.capitalize(), date, text, round(rng.uniform(0.3, 0.6), 2)))
        roles = rng.sample(list(TITLES), rng.randint(1, 3))
        for k, role in enumerate(roles):
            nm = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            le = shift(TODAY, -rng.randint(10, 150)) if rng.random() < 0.7 else None
            CONTACTS.append({"id": f"003ORB{key[4:]}{k:02d}0000AAA", "account": key, "name": nm, "title": TITLES[role], "role": role,
                             "email": f"{nm.split()[0].lower()}.{nm.split()[1].lower()}@{key.lower()}.example",
                             "last_engaged": le, "opted_out": False, "do_not_call": False})
    return rows

def shift(iso, days):
    import datetime
    d = datetime.date.fromisoformat(iso) + datetime.timedelta(days=days)
    return d.isoformat()

def account_rows(rows):
    out = []
    for r in rows:
        key, name, ind, reg, emp, typ, motion, base, age, fit, ws, al = r
        out.append({"key": key, "salesforce_id": f"001ORB00000{key[4:]}AAA", "name": name, "industry": ind, "region": reg,
                    "employees": emp, "type": typ, "motion": motion, "baseline_score": base, "baseline_age_days": age,
                    "fit": fit, "whitespace": ws, "alignment": al, "owner_id": OWNER["id"]})
    return out

# ---------------------------------------------------------------- labelled Gong segments
def gong_segments(rng):
    """Labelled segments with planted truth, for the extraction check.
    tracker = the keyword tracker fired; truth = a customer-spoken buying signal is really present."""
    templates = [
      ("customer", True,  "Budget", "We have money set aside for this next quarter."),
      ("customer", True,  "Timeline", "We need this live before the spring season."),
      ("customer", True,  "Pain", "Dispatch re-keys every job into two systems."),
      ("seller",   False, "Budget", "Do you have budget allocated for this?"),
      ("seller",   False, "Pricing", "Let me walk you through our pricing tiers."),
      ("customer", False, "Pricing", "Pricing is not something we are looking at this year."),
      ("customer", True,  "Authority", "I will bring our CFO to the next call."),
      ("seller",   False, "Timeline", "What timeline are you working towards?"),
      ("customer", False, "Budget", "There is no budget until the network build is done."),
      ("customer", True,  "Expansion", "The other depots want the same setup."),
      # cases simple rules get wrong, so the offline check is not graded against itself
      ("customer", False, "Small talk", "Pricing came up at our offsite, but nothing changed."),
      ("customer", False, "Small talk", "Budget season is always busy for us."),
      ("seller",   True,  "Relayed", "As Dana said last week, budget is set aside for Q1."),
      ("customer", True,  "Commitment", "Sure, send the security questionnaire over."),
    ]
    rows = []
    for i in range(214):
        side, truth, typ, text = templates[rng.randrange(len(templates))]
        tracker = typ in ("Budget", "Pricing", "Timeline") or rng.random() < 0.3
        rows.append({"id": f"SEG-{i+1:04d}", "speaker_side": side, "type": typ, "text": text, "tracker_hit": tracker, "truth": truth,
                     "negated": ("not" in text or "no budget" in text.lower())})
    return rows

# ---------------------------------------------------------------- synthetic backtest history
def backtest(rng):
    """8 sellers x 12 weekly snapshots x 25 accounts.
    Stated assumption of this synthetic world: conversion depends more on what customers say (momentum)
    than on fit, and the baseline score counts all call activity, including our own reps' questions.
    The backtest therefore shows the method, not a real-world result."""
    rows = []
    for s in range(1, 9):
        for w in range(1, 13):
            for a in range(1, 26):
                fit = rng.uniform(20, 95)
                cust = max(0.0, rng.gauss(40, 25))
                rep_noise = max(0.0, rng.gauss(40, 30))
                readiness = rng.choice([0, 25, 37.5, 50, 62.5, 75, 87.5, 100])
                momentum = 100 * (1 - math.exp(-cust / 45))
                baseline = 0.5 * fit / 100 + 0.5 * min(1.0, (cust + rep_noise) / 120)
                logit = -4.6 + 0.02 * fit + 0.045 * momentum + 0.01 * readiness
                p = 1 / (1 + math.exp(-logit))
                outcome = 1 if rng.random() < p else 0
                rows.append([f"S{s:02d}", w, f"A{a:02d}", round(fit, 1), round(momentum, 1), readiness, round(baseline, 4), outcome])
    return rows

# ---------------------------------------------------------------- writers
def write_json(name, obj):
    with open(os.path.join(SEED, name), "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False, sort_keys=False)
        f.write("\n")

def apex_str(s):
    return "null" if s is None else "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"

def write_apex(accounts):
    lines = [
     "// Account Focus demo seed. Generated by data/generate_data.py. All data is fictional.",
     "// Safe to re-run: it deletes only records it created (Site = 'Account Focus demo').",
     "String MARK = 'Account Focus demo';",
     "List<Account> old = [SELECT Id FROM Account WHERE Site = :MARK];",
     "delete [SELECT Id FROM Opportunity WHERE AccountId IN :old];",
     "delete [SELECT Id FROM Case WHERE AccountId IN :old];",
     "delete [SELECT Id FROM Contact WHERE AccountId IN :old];",
     "delete old;",
     "Map<String, Account> acc = new Map<String, Account>();"]
    for a in accounts:
        emp = "null" if a["employees"] is None else str(a["employees"])
        country = {"NA": "US", "EMEA": "GB", "APAC": "AU"}[a["region"]]
        lines.append(f"acc.put({apex_str(a['key'])}, new Account(Name={apex_str(a['name'])}, AccountNumber={apex_str(a['key'])}, Site=MARK, "
                     f"Industry={apex_str(a['industry'] if a['industry'] != 'Food & Beverage' else 'Food & Beverage')}, NumberOfEmployees={emp}, "
                     f"Type={apex_str('Customer - Direct' if a['type']=='Customer' else 'Prospect')}, BillingCountryCode={apex_str(country)}));")
    lines.append("insert acc.values();")
    lines.append("List<Contact> cons = new List<Contact>();")
    for c in CONTACTS:
        first, last = c["name"].split(" ", 1)
        lines.append(f"cons.add(new Contact(AccountId=acc.get({apex_str(c['account'])}).Id, FirstName={apex_str(first)}, LastName={apex_str(last)}, "
                     f"Title={apex_str(c['title'] or None)}, Email={apex_str(c['email'])}, HasOptedOutOfEmail={'true' if c['opted_out'] else 'false'}, "
                     f"DoNotCall={'true' if c['do_not_call'] else 'false'}, Description={apex_str('focus_role=' + (c['role'] or 'none'))}));")
    lines.append("insert cons;")
    lines.append("List<Opportunity> opps = new List<Opportunity>();")
    for s in SIGNALS:
        if s["ref"].startswith("SF-OPP-"):
            parts = s["text"].split(" · ")
            amount = parts[3].replace("$", "").replace(",", "") if len(parts) > 3 and parts[3].startswith("$") else "null"
            stage = {"Discovery": "Prospecting", "Qualification": "Qualification", "Closed Lost": "Closed Lost"}.get(parts[2], "Proposal/Price Quote")
            close = "Date.newInstance(2024, 8, 15)" if stage == "Closed Lost" else "Date.newInstance(2027, 3, 31)"
            lines.append(f"opps.add(new Opportunity(AccountId=acc.get({apex_str(s['account'])}).Id, Name={apex_str(parts[0] + ' - ' + parts[1])}, "
                         f"StageName={apex_str(stage)}, Amount={amount}, CloseDate={close}, Description={apex_str('evidence_ref=' + s['ref'])}));")
    lines.append("insert opps;")
    lines.append("List<Case> cases = new List<Case>();")
    lines.append("cases.add(new Case(AccountId=acc.get('GTM-0012').Id, Subject='Shift swap sync failing for night staff', Priority='High', Status='New', Description='evidence_ref=SF-CASE-00001044'));")
    lines.append("insert cases;")
    lines.append("System.debug('Account Focus demo seed: ' + acc.size() + ' accounts, ' + cons.size() + ' contacts, ' + opps.size() + ' opportunities.');")
    with open(os.path.join(ROOT, "salesforce", "seed.apex"), "w") as f:
        f.write("\n".join(lines) + "\n")

def sql_json(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    assert "$$" not in s
    return s

def write_seed_sql(payload, segments, bt_rows):
    out = ["-- Account Focus: load seed data. Generated by data/generate_data.py. Fictional data only.",
           "-- Safe to re-run: each table is emptied first.",
           "USE ROLE ACCOUNT_FOCUS_ADMIN;", "USE WAREHOUSE ACCOUNT_FOCUS_WH;", "USE SCHEMA ACCOUNT_FOCUS.CORE;", ""]
    tables = [("AF_ACCOUNT", "accounts", "key"), ("AF_SIGNAL", "signals", "ref"), ("AF_CONTACT", "contacts", "id"),
              ("AF_VALUEMAP", "valuemap", None)]
    for table, name, key in tables:
        out.append(f"TRUNCATE TABLE {table};")
        out.append(f"INSERT INTO {table} (K, ACCOUNT_KEY, DATA)")
        kexpr = f"f.value:{key}::STRING" if key else "f.value:account::STRING || '#' || f.index"
        akey = "f.value:key::STRING" if table == "AF_ACCOUNT" else "f.value:account::STRING"
        out.append(f"SELECT {kexpr}, {akey}, f.value FROM TABLE(FLATTEN(INPUT => PARSE_JSON($${sql_json(payload[name])}$$))) f;")
        out.append("")
    for table, name in [("AF_DRAFT", "drafts"), ("AF_PREP", "prep")]:
        out.append(f"TRUNCATE TABLE {table};")
        out.append(f"INSERT INTO {table} (ACCOUNT_KEY, DATA)")
        out.append(f"SELECT f.key, f.value FROM TABLE(FLATTEN(INPUT => PARSE_JSON($${sql_json(payload[name])}$$))) f;")
        out.append("")
    out.append("-- Evaluation inputs: labelled call segments and the synthetic backtest history.")
    out.append("TRUNCATE TABLE AF_SEGMENT;")
    out.append(f"INSERT INTO AF_SEGMENT (DATA) SELECT f.value FROM TABLE(FLATTEN(INPUT => PARSE_JSON($${sql_json(segments)}$$))) f;")
    out.append("TRUNCATE TABLE AF_BACKTEST;")
    cols = ["seller", "week", "account", "fit", "momentum", "readiness", "baseline_score", "outcome_60d"]
    rows = [dict(zip(cols, r)) for r in bt_rows]
    for i in range(0, len(rows), 800):
        out.append(f"INSERT INTO AF_BACKTEST (DATA) SELECT f.value FROM TABLE(FLATTEN(INPUT => PARSE_JSON($${sql_json(rows[i:i+800])}$$))) f;")
    out.append("")
    out.append("TRUNCATE TABLE AF_CATALOG;")
    out.append(f"INSERT INTO AF_CATALOG (DATA) SELECT PARSE_JSON($${sql_json(payload['catalog'])}$$);")
    out.append("")
    out.append("MERGE INTO AF_CONFIG t USING (SELECT f.key AS K, f.value::STRING AS V FROM TABLE(FLATTEN(INPUT => PARSE_JSON($$" + sql_json({k: (json.dumps(v) if not isinstance(v, str) else v) for k, v in payload["config"].items()}) + "$$))) f) s")
    out.append("  ON t.K = s.K WHEN MATCHED THEN UPDATE SET V = s.V WHEN NOT MATCHED THEN INSERT (K, V) VALUES (s.K, s.V);")
    with open(os.path.join(ROOT, "snowflake", "04_seed.sql"), "w") as f:
        f.write("\n".join(out) + "\n")

def main():
    rng = random.Random(20261109)
    os.makedirs(SEED, exist_ok=True)
    rows = fill_rest(rng)
    accounts = account_rows(rows)
    config = {"demo_today": TODAY, "owner": OWNER, "seller": SELLER, "model": "scripted", "cortex_model": "mistral-large2",
              "brief_size": 5, "max_per_motion": 3, "cooldown_days": 14, "snooze_days": 3, "min_confidence": 50,
              "scoring_version": "af_v1.0"}
    payload = {"config": config, "accounts": accounts, "signals": SIGNALS, "contacts": CONTACTS, "drafts": DRAFTS,
               "prep": PREP, "catalog": CATALOG, "valuemap": VALUEMAP}
    for k, v in payload.items():
        write_json(f"{k}.json", v)
    segments = gong_segments(rng)
    with open(os.path.join(SEED, "gong_segments.jsonl"), "w") as f:
        for r in segments:
            f.write(json.dumps(r) + "\n")
    bt_rows = backtest(rng)
    with open(os.path.join(SEED, "backtest.csv"), "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["seller", "week", "account", "fit", "momentum", "readiness", "baseline_score", "outcome_60d"])
        w.writerows(bt_rows)
    write_apex(accounts)
    write_seed_sql(payload, segments, bt_rows)
    print(f"Wrote {len(accounts)} accounts, {len(SIGNALS)} signals, {len(CONTACTS)} contacts to data/seed, "
          "salesforce/seed.apex and snowflake/04_seed.sql")

if __name__ == "__main__":
    main()
