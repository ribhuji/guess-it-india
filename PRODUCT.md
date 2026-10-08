# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Casual users opening a public link who want to play a tiny 20 Questions game immediately, without an account or onboarding.

## Product Purpose

Guess It India lets a player choose one of four India-focused categories and identify a hidden answer by asking up to 20 yes/no questions. Success means the product is understood and playable within a few seconds.

## Positioning

An anonymous, disposable guessing game centered on Indian monuments, people, sportspersons, and numbers.

## Operating Context

The product is a small public web demo used on desktop and mobile browsers. A player selects a category, starts a game, submits questions, reviews a question ledger, and can give up or start a new game.

## Capabilities and Constraints

- Four categories: Monuments, Famous Indians, Sportspersons, and Numbers.
- A maximum of 20 submitted questions per game.
- Existing Worker API, Durable Object game sessions, Workers AI judging, and vanilla HTML/CSS/JavaScript frontend must remain unchanged functionally.
- No authentication, account, personal-data workflow, frontend framework, or large dependency.
- Category icons must not use emoji; the interface should remain accessible, keyboard-friendly, and usable around 360px wide.

## Brand Commitments

The product name is Guess It India. The interface should feel simple, quiet, warm, slightly editorial, contemporary, and playful without clichés or generic AI/SaaS styling.

## Evidence on Hand

The repository contains the current working frontend in `public/index.html`, `public/styles.css`, and `public/app.js`. No illustrations, testimonials, metrics, or other marketing assets are supplied.

## Product Principles

- Make the game obvious within seconds.
- Let the question-and-answer ritual carry the experience.
- Keep the interface restrained and memorable rather than feature-heavy.
- Preserve disposable anonymity and a low-friction first play.

## Accessibility & Inclusion

Maintain semantic controls, keyboard navigation, visible focus states, useful labels, readable contrast, disabled states, reduced-motion support, and mobile usability.
