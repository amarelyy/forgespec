# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Student hardware teams (robotics clubs, maker and capstone teams) who plan a build together and buy parts from distributors. The job: pick parts, keep one shared parts list, and find out before ordering that a part will not work on their board (a 3.3 V sensor on a 5 V rail, a part that does not fit). Many visitors arrive without an account and want to look around first.

The project is also a university Web Application Development assignment; the lecturer evaluates the deployed site by logging in with a given account (admin@email.com) and judging it as one of these teams would.

## Product Purpose

ForgeSpec is "GitHub for bills of materials": a version-controlled parts list (BOM) for a hardware project, with distributor spec import and a rule engine that flags electrical and physical mismatches before parts are bought. Success: a team never orders a part that cannot work, and always knows what changed in the list and who changed it.

## Positioning

Versioning plus checking on the parts list itself. Distributor datasheet text ("1.71V ~ 3.6V") is parsed into numbers, every part is checked against the board's supply rails and the other parts, and each save is an immutable version that can be compared with any other. Spreadsheets and distributor carts do neither.

## Operating Context

- Teams plan in browsers, usually on laptops; parts come from distributors (Octopart/Nexar, or a built-in mock catalogue offline).
- Guests can search the Component Library and read parsed specs without an account; saving, projects, custom parts and teams need an account.
- Workflow vocabulary: project, Component List (BOM), version, compare versions, compatibility report, rail, sub-assembly, export (CSV/PDF), custom part.

## Capabilities and Constraints

- Built and live: homepage, guest part search (`GET /components/search`), auth (register, login, logout, profile), backend for projects, BOM, versions, compare, compatibility, rules, sub-assemblies, export, team, notifications.
- Not built in the frontend yet: Dashboard, Project Workspace, Custom Part Creator, settings pages. The UI marks these "Soon" and asks guests to log in.
- Stack: React 19 + Vite + TypeScript, three.js for 3D; frontend on Vercel, backend on Render (free tier, ~50 s cold start), Postgres on Neon.
- The homepage must keep: a preview of what the app does, the 3D circuit board, and the Component Library search.
- Rule kept by tests: no emoji anywhere in the UI.

## Brand Commitments

- Name: ForgeSpec. Existing logo mark in `frontend/src/ui/Sprite.tsx` and `frontend/public/favicon.svg`.
- Plain, concrete voice: short sentences, real part numbers, no hype. Spec values are shown with the raw datasheet text next to the parsed number.
- Quality references named by the lecturer for the homepage: nike.com/id and ferrari.com/en-ID (craft level and confidence, not a look to copy).
- Navigation: kept to a small number of top-level items (the lecturer's 5–7 guidance); one account button ("Sign In", sign-up inside), a header search with live results.

## Evidence on Hand

- Sample catalogue of 14 real parts with real datasheet strings (`frontend/src/ui/catalog.tsx`); mock distributor of 10 parts in the backend.
- A worked example: a line-follower robot team, BME280 sensor failing on a 5 V rail, fixed with an AMS1117-3.3 regulator, saved as version 15.
- No customers, testimonials, usage numbers, or pricing exist. Do not invent them.

## Product Principles

1. Show the check, don't describe it: the visitor should see a part fail and get fixed.
2. Guests first: everything that only reads works without an account.
3. Raw datasheet text and the parsed number always appear together.
4. Unbuilt features are labelled honestly ("Soon"), never faked.

## Accessibility & Inclusion

Keyboard and screen-reader reachable controls with real accessible names (the test suite queries by role and name); `prefers-reduced-motion` respected by every animation, including the 3D board; WebGL is optional (the page works without it).
