---
name: Nocturnal Command
colors:
  surface: '#0c1322'
  surface-dim: '#0c1322'
  surface-bright: '#323949'
  surface-container-lowest: '#070e1d'
  surface-container-low: '#141b2b'
  surface-container: '#191f2f'
  surface-container-high: '#232a3a'
  surface-container-highest: '#2e3545'
  on-surface: '#dce2f7'
  on-surface-variant: '#cfc2d6'
  inverse-surface: '#dce2f7'
  inverse-on-surface: '#293040'
  outline: '#988d9f'
  outline-variant: '#4d4354'
  surface-tint: '#ddb7ff'
  primary: '#ddb7ff'
  on-primary: '#490080'
  primary-container: '#b76dff'
  on-primary-container: '#400071'
  inverse-primary: '#842bd2'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#a4c9ff'
  on-tertiary: '#00315d'
  tertiary-container: '#4c93e7'
  on-tertiary-container: '#002a51'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f0dbff'
  primary-fixed-dim: '#ddb7ff'
  on-primary-fixed: '#2c0051'
  on-primary-fixed-variant: '#6900b3'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#d4e3ff'
  tertiary-fixed-dim: '#a4c9ff'
  on-tertiary-fixed: '#001c39'
  on-tertiary-fixed-variant: '#004883'
  background: '#0c1322'
  on-background: '#dce2f7'
  surface-variant: '#2e3545'
  bg-canvas: '#000000'
  bg-chrome: '#0a0a0a'
  bg-sidebar: '#1a1a1a'
  bg-surface: '#111827'
  bg-card: '#2a2a2a'
  bg-card-subtle: '#1e1e1e'
  border-subtle: '#1f2937'
  border-emphasis: '#ffffff'
  text-primary: '#ffffff'
  text-secondary: '#d1d5db'
  text-tertiary: '#9ca3af'
  text-muted: '#6b7280'
  text-subtle: '#4b5563'
  status-ready: '#22c55e'
  status-caution: '#f59e0b'
  status-urgent: '#ef4444'
  status-info: '#3b82f6'
  accent-purple-glow: '#c084fc'
  accent-cyan-bright: '#22d3ee'
  accent-shift-blue: '#0000ff'
  accent-lime: '#bef754'
typography:
  headline-hero:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '800'
    lineHeight: 76px
    letterSpacing: -0.03em
  headline-hero-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-eyebrow:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
  label-badge:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.05em
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
  mono-metric-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an operational command center aesthetic engineered for extreme restaurant rush environments, low-light kitchen pass stations, and rapid-fire floor management. The brand identity fuses industrial operational utility with high-voltage synthetic intelligence.

The visual style blends **High-Contrast Dark Mode** with **Cybernetic Minimalism**:
- **Deep Obsidian Substrates**: Background canvases leverage absolute black and deep midnight grays to eliminate screen glare and reduce eye fatigue during 12-hour shifts.
- **Luminescent Accent Trajectories**: Vibrant purple-to-cyan energy gradients signal active states, primary call-to-actions, and automated voice AI operations.
- **Glanceable Telemetry**: Information architecture relies on rigid tabular metrics, high-contrast monospace counters, and unambiguous semantic status indicators.
- **Touch-Forgiving Ergonomics**: Touch surfaces feature oversized interaction targets, visual state feedback, and dense data displays optimized for greasy screens and gloved usage.

## Colors

The color palette establishes strict functional tiers across dark backdrops:

### Surface Hierarchy
- **Canvas Base (`#000000`)**: Deep floor for viewport backgrounds, KDS boards, and full-screen modal overlays.
- **Chrome Shell (`#0a0a0a`)**: Top utility header and command bars.
- **Sidebar Rail (`#1a1a1a`)**: Navigation shell anchor featuring the high-contrast `#bef754` active indicator line.
- **Surface Elevation (`#111827`)**: Base container fill for modals, slide-overs, and structural panes.
- **Interactive Card Surface (`#2a2a2a`)**: Elevated surface for cards, menu item touch tiles, and interactive inputs.

### Semantic Status Matrix
Operational alerts must use strict color coding paired with text labels:
- **Ready / Available (`#22c55e`)**: Online WebSocket link, unoccupied tables, completed KDS orders, in-stock inventory.
- **Caution / Pending (`#f59e0b`)**: Reserved floor tables, aging kitchen orders, reorder-threshold ingredients.
- **Urgent / Occupied (`#ef4444`)**: Occupied dining tables, stockouts, overdue KDS tickets (>15 mins), order cancellations.
- **Information / Prep (`#3b82f6`)**: Active kitchen prep states, scheduled shifts, incoming reservation sync.

### Gradient Accents
- **Primary Action Gradient**: Linear from `#a855f7` (Purple 500) to `#06b6d4` (Cyan 500). Used on checkout triggers, shift clock-in, and primary save buttons.
- **Display Text Gradient**: Linear from `#60a5fa` (Blue 400) to `#22d3ee` (Cyan 400), clipped to text for high-impact hero headings and KPI numbers.

## Typography

The dual-font system prioritizes immediate visual recognition:
- **Inter** provides high legibility across navigational labels, user metadata, dish descriptions, and long-form AI transcripts.
- **JetBrains Mono** enforces non-proportional, tabular alignment for currency values, ticket timers, item counts, table IDs, and status badges, preventing visual shifting when values update in real time via WebSockets.

### Rules of Usage
- All numerical metrics in operational tables, tickets, and charts must strictly use `JetBrains Mono`.
- Subtitles directly below section headers use `text-tertiary` (`#9ca3af`) with tight vertical spacing.
- Eyebrow labels, table headers, and status badges must be styled in uppercase with tracking expanded (`letterSpacing: 0.05em` to `0.08em`).

## Layout & Spacing

The layout architecture employs a fixed operational dashboard pattern built on a 4px base increment:

### Application Shell Structure
- **Sidebar Rail**: Fixed left column with a collapsed width of `80px` (icon-only mode for POS tablets) and an expanded width of `256px` for desktop managers.
- **Top Utility Bar**: Fixed height of `64px` (`4rem`) containing store selectors, live WebSocket indicators, search triggers, and the active staff identity.
- **Main Canvas**: Fluid operational surface with minimum padding of `16px` (`1rem`) on tablet devices, expanding to `24px`–`32px` on high-resolution widescreen monitors.

### Responsive Breakpoints
- **Mobile (< 768px)**: Single column layouts, sticky bottom drawer navigation for carts, full-screen takeover modal panels, minimum touch target height of `48px`.
- **Tablet (768px – 1024px)**: Dual-pane split screens (POS menu grid + sticky cart sidebar; Floor canvas + waitlist drawer), collapsed navigation rail (`80px`).
- **Desktop (> 1024px)**: Full multi-pane orchestration, persistent expanded navigation sidebar, high-density data grids with multi-column KPI shelves.

## Elevation & Depth

Visual hierarchy uses tonal surface layering and low-contrast perimeter definition rather than heavy drop shadows:

- **Level 0 (Canvas Base)**: `#000000`. Recessed foundation.
- **Level 1 (Structural Shell)**: `#0a0a0a` and `#111827`. Used for app headers, side navigation bars, and section backgrounds.
- **Level 2 (Containers & Cards)**: `#2a2a2a` bordered by a crisp 1px stroke of `#1f2937`. Used for order items, table tiles, and metric panels.
- **Level 3 (Interactive Floating Panels & Modals)**: `#1e1e1e` or `#111827` surface with a 1px border of `#374151` and an ambient glow shadow: `0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.5)`. Modals sit atop a backdrop blur: `backdrop-filter: blur(8px); background-color: rgba(0, 0, 0, 0.75)`.
- **Alert Elevation**: Critical overdue tickets and out-of-stock rows apply a continuous pulsing outer border (`box-shadow: 0 0 12px rgba(239, 68, 68, 0.45)`).

## Shapes

The design uses balanced, rounded corners to maintain ergonomic tactile affordances:
- **Base Components (Inputs, Chips, Table Cells)**: `0.5rem` (`8px`) corner radius for compact utility.
- **Cards & POS Menu Tiles**: `0.75rem` (`12px`) to `1rem` (`16px`) corner radius for comfortable touch areas.
- **Modals & Flyouts**: `1rem` (`16px`) to `1.5rem` (`24px`) radius for prominent boundaries.
- **Status Pills & Live WebSocket Badges**: Fully rounded (`9999px`) pill geometries.

## Components

### Buttons
- **Primary CTA**: Background gradient `linear-gradient(to right, #a855f7, #06b6d4)`, label in white bold text, rounded-lg (`8px`), padding `10px 16px`. Active press effect: scale `0.97`.
- **Secondary Action**: Border of `2px solid #ffffff`, transparent background, text in `#ffffff`. On hover: background `#ffffff`, text `#000000`.
- **Utility / Ghost Button**: Background `#1e1e1e`, border `1px solid #1f2937`, text `#d1d5db`. On hover: border `#4b5563`, text `#ffffff`.
- **Semantic Bump Button (KDS)**: Solid Emerald (`#16a34a`), text white, full card width, minimum touch height `48px`. Destructive actions use solid Crimson (`#dc2626`).

### Cards & Stat Tiles
- **Operational KPI Card**: Container surface `#2a2a2a` with `#1f2937` border. Top row houses an uppercase eyebrow label (`JetBrains Mono`, 11px) alongside a 36px tinted icon container. Primary metric rendered in bold monospace (`mono-metric-lg`).
- **POS Menu Item Tile**: Minimum dimension `120px` height. Features item photography with a dark gradient scrim at base, high-contrast title in Inter (`14px`, 600 weight), and an emerald or cyan price badge anchored bottom-right in `JetBrains Mono`.

### Kitchen Display (KDS) Tickets
- **Layout**: Fixed `320px` width card with vertical column flex.
- **Header Bar**: 6px top accent strip matching ticket status (`#f59e0b` Pending, `#7c3aed` Preparing, `#22c55e` Ready). Tickets exceeding 15 minutes trigger a pulsing `3px solid #ef4444` border.
- **Timers**: Right-aligned `JetBrains Mono` timer showing elapsed `mm:ss`.
- **Allergy & Modifier Alerts**: Displayed in prominent callout boxes with `#ef4444` text and `rgba(239, 68, 68, 0.15)` background fill.

### Floor Plan Nodes
- **Table Geometries**: Square (`72x72px`), rectangular (`120x72px`), and circular (`80px` diameter).
- **State Fills**:
  - `Available`: Stroke `#22c55e`, fill `rgba(34, 197, 94, 0.12)`, text `#22c55e`.
  - `Occupied`: Stroke `#ef4444`, fill `rgba(239, 68, 68, 0.18)`, text `#ffffff`.
  - `Reserved`: Stroke `#f59e0b`, fill `rgba(245, 158, 11, 0.15)`, text `#f59e0b`.
  - `Dirty / Reset`: Stroke `#6b7280`, fill `rgba(107, 114, 128, 0.15)`, text `#9ca3af`.

### Form Fields & Inputs
- **Text & Number Inputs**: Background `#1e1e1e`, border `1px solid #2a2a2a`, text `#ffffff`, placeholder `#6b7280`. Focused state triggers a `2px solid #a855f7` ring. Minimum height `44px` for touch accessibility.
- **Monospace Quantity Stepper**: Split button arrangement `[-] [qty] [+]` with minimum `40px` tap targets.