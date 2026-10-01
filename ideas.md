# Herbal Health Hub — Design Direction

## Three initial directions

### Theme Name: Botanical Editorial
Very Brief Intro: A warm, print-inspired wellness guide with botanical linework, paper texture, and a calm forest-and-citrus palette. The experience feels like a beautifully edited field guide rather than a generic medical dashboard.
Probability: 0.07

### Theme Name: Clinical Sunroom
Very Brief Intro: A bright, airy care companion built around soft whites, mineral blues, and lively produce photography. Clear modules and generous space make the product feel transparent, optimistic, and easy to trust.
Probability: 0.04

### Theme Name: Night Garden
Very Brief Intro: A dark, atmospheric wellness atlas with indigo surfaces, leaf silhouettes, and restrained electric-lime highlights. It turns health discovery into a quiet evening ritual without becoming cyberpunk.
Probability: 0.02

## Chosen approach: Botanical Editorial

### Design Movement
Contemporary botanical editorial design: the visual language of independent health journals, apothecary labels, and modern field guides translated into a responsive product experience.

### Core Principles
1. **Editorial hierarchy over dashboard density.** One question or action leads each section; supporting details are layered behind it.
2. **Warm evidence, not sterile clinical UI.** The design should communicate care and grounded confidence without making medical promises.
3. **Organic asymmetry.** Offset cards, generous margins, irregular image crops, and botanical markers should create a composed but human rhythm.
4. **Progressive clarity.** Recommendations are scannable first and explainable second, with caveats and care pathways always close at hand.

### Color Philosophy
Use a parchment-tinted canvas as the emotional ground: quiet, tactile, and unlike a typical SaaS white. Deep forest ink provides confidence and long-form readability. A singular marigold-citrus accent signals action and discovery, while muted sage and blush serve as supporting editorial annotations. Color should feel grown and harvested, not synthetic.

### Layout Paradigm
A left-weighted editorial composition with a slim persistent rail for brand and navigation, a wide content column for discovery, and asymmetric side notes for safety guidance or care pathways. Avoid perfect centered grids; favor intentional offsets, overlapping image frames, and sections that breathe.

### Signature Elements
- A small leaf-stamp brand mark paired with oversized editorial numerals and eyebrow labels.
- Fine botanical rules and ring-shaped annotation markers used as section anchors.
- Paper grain, soft ink shadows, and irregular rounded clipping on image cards.

### Interaction Philosophy
Interactions should feel like turning a page or selecting a specimen: tactile, quick, and informative. Search should filter immediately. Cards should reveal more context without abrupt navigation. Cart actions should confirm clearly but never feel like aggressive commerce. Medical safety notes should be visible before a user commits to an action.

### Animation
Use 180–260ms ease-out transitions for hover, focus, and filtering. Stagger recommendation cards by 45ms on first load. Use subtle translateY and opacity for section reveals; never scale from zero. Let leaf-stamp and underline motifs gently shift on hover. Respect prefers-reduced-motion and remove entrance choreography when it is enabled.

### Typography System
Display: **Fraunces** for expressive editorial headings, using 500–650 weights with tight line-height. Body/UI: **DM Sans** for clear reading and approachable controls, using 400–600 weights. Use uppercase DM Sans eyebrow labels with generous tracking. Never use Inter.

### Brand Essence
A calm health discovery guide for people who want practical food-and-herb ideas without losing sight of real-world care. Personality: **grounded, curious, caring**.

### Brand Voice
Headlines are warm, specific, and quietly confident. CTAs are direct invitations, not commands. Microcopy acknowledges uncertainty and keeps the user's next step small.

Example lines:
- “Start with what you’re feeling.”
- “Food can support the plan. Care keeps it honest.”

### Wordmark & Logo
The mark is a compact leaf-stamp: two offset seed shapes inside an open circular ring, suggesting a conversation between food and care. The wordmark uses a custom typographic lockup with a slightly raised “H” crossbar and is never rendered as a default plain text logo alone.

### Signature Brand Color
**Marigold Citrus — #D79A32**, a warm amber used only for primary discovery actions, active markers, and small moments of optimism.

## Style Decisions
- Use **Fraunces + DM Sans** and the Botanical Editorial system throughout the project.
- Keep the background warm and tactile, not pure white.
- Use deep forest green for primary type and navigation.
- Use generated imagery only for the hero and a small number of prominent botanical product cards; do not reuse one image for multiple sections.
- Treat recommendations as supportive education, not medical treatment claims.
- Keep shopping and hospital search accessible from the same primary navigation.
- The Herbal Health wordmark always includes a visibly custom raised-H detail in header and footer.
- Product cards lead with ingredient guidance; price and purchase cues remain secondary annotations.
- Every major section carries a field-guide device such as a spine, ring marker, botanical rule, side note, or specimen frame.
