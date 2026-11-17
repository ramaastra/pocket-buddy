# Branded initial loading state

## Problem

The initial session/account bootstrap currently replaces the screen with the text “Loading your account…”.

## Outcome

Use a small branded loading animation during app startup and signed-in account bootstrap. Keep the full-screen state limited to bootstrap; ordinary navigation uses the route progress bar.

## Design

Add four smaller four-point sparkles at randomized positions around and over the Pocket Buddy mark. Use light contrasting colors over the wallet. Make the first sparkle visible immediately and stagger the remaining twinkles. Use the short message “Getting things ready”. Respect reduced-motion preferences and keep the loading status accessible to screen readers.
