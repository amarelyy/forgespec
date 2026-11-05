# ForgeSpec landing page

Static landing page for ForgeSpec, "GitHub for your bill of materials".
Plain HTML, CSS and JavaScript. No build step and no dependencies apart from Google Fonts.

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve .
# or
python -m http.server 8000
```

## Files

```
index.html        page markup (nav, hero + part drawer, carousel, walkthrough, guest band, footer)
css/style.css     design tokens (light + dark), layout, components, animations
js/main.js        part drawer search/filter + unit parser, auto carousel, walkthrough animation
assets/favicon.svg
```

## Sections

1. **Hero**: headline plus a scrollable Component Library drawer (search, category chips, expandable spec rows that show the raw string next to the parsed value).
2. **Carousel**: 4 slides that advance every 4 s. Use the side arrows to step, the top-right button to pause, or swipe on touch screens.
3. **Walkthrough**: a 5-step animation of one sensor going from search to saved version. It starts when scrolled into view and pauses on hover.
4. **Guest band**: Try as guest / Register / Log in.
5. **Footer**.

## Where to change things

- **Colours**: the `:root` tokens at the top of `css/style.css`. Dark mode tokens sit right below them.
- **Parts in the drawer**: the `CAT` array in `js/main.js`.
- **Carousel speed**: `--dur` in the carousel section of `js/main.js` (default `4s`).
- **Walkthrough step lengths**: the `DUR` array in `js/main.js` (milliseconds).
- **Links**: Log in, Register, Documentation and Contact point to `#` anchors for now. Swap them for real routes when those pages exist.

Respects `prefers-reduced-motion`: the carousel and the walkthrough both start paused, and visitors can press Play to run them.
