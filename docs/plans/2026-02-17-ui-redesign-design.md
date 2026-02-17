# UI/UX Redesign Design

## Direction
Refine the existing dark theme into a premium reading-app aesthetic (Kindle/Apple Books inspiration). Content-first, minimal chrome, warm and focused.

## Layout

### Top Bar (~50px, sticky)
- Left: app name "Bible Vote" in serif
- Center: current group name (subtle)
- Right: menu hamburger icon
- Blurred background on scroll

### Side Drawer (slides from right)
- Overlay with backdrop dim
- Sections: user switcher, group list + create, invite join/generate, notifications
- Close via X button or tap outside
- Smooth slide animation (200ms ease)

### Bottom Tab Bar (mobile, fixed)
- 4 tabs: Vote, Read, History, Squad
- Simple SVG icons + labels
- Active tab highlighted with gold
- Safe area padding for notched phones

### Desktop (>768px)
- Bottom tabs become horizontal top tabs below the header
- Content max-width stays 680px, centered
- Side drawer still works the same way

## Visual Refinements
- Keep color palette: dark backgrounds (#1a1a16), cream text (#e8e0d0), gold accents (#c9a96e)
- Softer card borders, more padding (18px), subtle background gradients
- Better typography hierarchy: Literata for headings/references, DM Sans for body
- Larger touch targets (min 44px)
- More vertical spacing between sections
- Smooth transitions on interactive elements

## Component Changes

### Proposal Cards (Vote tab)
- Cleaner layout with reference prominent in serif
- Vote count as large gold number (right-aligned)
- Vote button more prominent, full-width on mobile
- Voted state clearly indicated (filled gold border + checkmark)

### Reading View (Read tab)
- Scripture reference as large serif heading
- Proposer + note below in subtle text
- Read status as pill-shaped toggle buttons (not generic buttons)
- Member read status as small avatar circles with status indicators
- Discussion section with clear separation

### History Cards
- Clean list with reference, date, and counts
- Subtle alternating backgrounds for scanability

### Squad
- Member cards with avatar, name, role badge
- Activity indicators as small colored dots

## Files Changed
- `app/globals.css` — full rewrite
- `app/page.tsx` — restructure JSX for new layout, add drawer component

## Icons
Inline SVG — no external dependency. Icons needed: menu, close, vote/hand, book-open, clock, users, bell, plus, check.
