# Persist loading state across navigation

## Problem

Navigating between client routes briefly replaces the app with “Loading your account…” and repeats the session check.

## Outcome

Keep the app shell, session, and loaded account data mounted while the pathname changes. Keep the full-screen account loading UI for the initial session/account bootstrap only.

## Scope

- Mount `PocketBuddyApp` in the persistent Next.js root layout.
- Leave the catch-all page as an empty route boundary because the app selects its screen from `usePathname`.
- Show a delayed, top-edge progress bar during slow route transitions while leaving the current screen visible.
- Document the persistent-shell behavior in architecture notes.
- Verify navigation in a browser under simulated slow network conditions.
