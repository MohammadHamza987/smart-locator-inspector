# Smart Locator Inspector

A Manifest V3 Chrome extension that lets QA engineers and automation developers hover any element on a web page and instantly get **validated, ranked locators** for **Playwright (JavaScript)** and **Selenium (Java)**.

Every candidate is evaluated against the live page before it is shown: you see how many elements it matches, whether the single match is the element you picked, and an estimate of how stable it is. Everything runs locally in your browser. There is no backend, account, API key or AI service.

---

## Features

- **Hover inspector**: highlights the element under the pointer and shows a compact tooltip with tag, id, relevant classes, name, role, accessible name, label, placeholder, aria-label, test id and a sanitized text preview. Click to select; press `Esc` (or the on-page **Stop** button) to stop.
- **Smart targeting**: an icon `<svg>` or `<span>` inside a button resolves to the button. Use **Parent** to walk up the tree.
- **Locator generation**
  - Playwright: `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `getByText`, `getByAltText`, `getByTitle`, CSS, XPath, plus scoped chains such as `page.getByRole('row').filter({ hasText: 'Bob' }).getByRole('button', { name: 'Delete' })`.
  - Selenium Java: `By.id`, `By.name`, `By.cssSelector`, `By.xpath`, `By.className`, `By.linkText`, `By.partialLinkText`.
- **Accessible-name estimation** following the main accname rules: `aria-labelledby`, `aria-label`, `<label for>`, wrapping labels, `alt`, button `value`, name-from-content (skipping `aria-hidden` content), `title` and `placeholder`.
- **Live validation**: CSS through `querySelectorAll`, XPath through `document.evaluate`, and Playwright semantics emulated (case-insensitive substring matching by default, `exact: true` added only when needed, hidden elements excluded for `getByRole`, deepest match for `getByText`).
- **Ranking engine**: deterministic, rule-based scoring (no AI). Each candidate gets a rating (**Recommended**, **Good**, **Acceptable**, **Fragile**, **Unverified**), a separate **stability** level (high, medium or low) and a plain-English explanation with warnings.
- **Code generation**: a locator expression plus a separate usage example (`click()`, `fill()`, `check()`, `selectOption()`, `sendKeys()`, …), with correct JavaScript, Java, CSS and XPath escaping, including XPath `concat()` for mixed quotes.
- **Selenium conversions**: Playwright-only semantic locators are linked to their closest Selenium equivalent with an explanation, never a fabricated API.
- **Show matches**: outlines every element a locator matches on the page.
- **Two UIs**: an in-page panel (works after the popup closes) and a Vue 3 popup with full details, framework tabs and copy buttons.
- **Keyboard shortcut**: `Alt+Shift+L` toggles inspection (configurable at `chrome://extensions/shortcuts`).

## How it works

```
 Popup (Vue 3)                Service worker                 Content script (page)
 ─────────────                ──────────────                 ─────────────────────
 Start ──executeScript──────────────────────────────────────▶ guarded single instance
       ──START_INSPECTOR────────────────────────────────────▶ listeners + overlay
                                                             hover → throttled analysis
       ◀─ELEMENT_HOVERED / ELEMENT_SELECTED───────────────────  engine: generate → validate → rank → render
                              ◀─INSPECTOR_STATUS_CHANGED────   (badge ON / ✓)
 Copy / Show matches ─HIGHLIGHT_LOCATOR─────────────────────▶ re-resolve + outline matches
 Stop ──STOP_INSPECTOR──────────────────────────────────────▶ remove listeners, overlay, cursor style
```

- Injection happens **only** after an explicit user action (toolbar popup or keyboard shortcut) using `activeTab` + `chrome.scripting`.
- Locator generation and DOM validation run **inside the page's content script**. Only serializable results (strings and numbers) are sent to the popup. DOM references never leave the document and nothing is written to extension storage.
- The overlay lives in a **closed shadow root** on a custom host element. It never modifies page elements, is excluded from every locator query and cannot become the inspected target.
- The only temporary page change is a crosshair cursor style added through `document.adoptedStyleSheets`, which is removed on stop.

### Message types

Defined in `src/shared/constants.js`, validated by `isValidMessage()` (source tag, known type, object payload) and by sender id:

`START_INSPECTOR`, `STOP_INSPECTOR`, `GET_INSPECTOR_STATUS`, `HIGHLIGHT_LOCATOR`, `SELECT_PARENT`, `ELEMENT_HOVERED`, `ELEMENT_SELECTED`, `INSPECTOR_STATUS_CHANGED`, `INSPECTOR_ERROR`.

### Ranking model

`src/engine/ranker.js` is a pure function of a candidate's traits and its validation result:

1. **Base preference by what the locator depends on**: test id › role+name › label › stable id › name › aria-label › alt › placeholder › link text › text › … › classes › structure › absolute path.
2. **Stability multiplier** from heuristics in `src/engine/stability.js`: generated ids (`ember123`, `:r5:`, UUIDs, hashes), CSS-in-JS and CSS-module classes, state and utility classes, numbers and currency in text, long values.
3. **Structural penalties**: ancestor depth, positional indexes, absolute paths, long selectors, XPath readability.
4. **Validation gates**: a candidate can only be Good, Acceptable or Recommended if it matches **exactly one element and that element is the selected one**. Ambiguous candidates are always Fragile and show their match count; unevaluable ones are Unverified.
5. Exactly one candidate per framework is promoted to **Recommended**, and only if it passes the gate and an acceptable score.

Because stability scales the base preference, context matters: a stable `data-testid` beats a role whose name is `"Order #48213"`, and a clean id beats a link whose name is a long, numeric sentence.

## Folder structure

```
├── public/
│   ├── manifest.json            # MV3 manifest (activeTab + scripting only)
│   └── icons/                   # 16/32/48/128 PNG icons (scripts/generate-icons.mjs)
├── src/
│   ├── background/service-worker.js   # badge state, keyboard shortcut, navigation reset
│   ├── content/
│   │   ├── content.js           # inspector state machine, events, messaging
│   │   ├── overlay.js           # shadow-DOM highlight, tooltip, panel, match outlines
│   │   └── inspector.css        # overlay styles (inlined into the content bundle)
│   ├── engine/
│   │   ├── accessibility.js     # roles, accessible names, visibility
│   │   ├── anchors.js           # stable ancestors and repeated-row containers
│   │   ├── candidate-generator.js  # Playwright semantic + Selenium candidates, scoping
│   │   ├── css-generator.js
│   │   ├── xpath-generator.js
│   │   ├── dom-inspector.js     # target resolution, privacy-safe element details
│   │   ├── escape.js            # CSS/XPath/JS/Java escaping
│   │   ├── stability.js         # dynamic id/class/text heuristics
│   │   ├── validator.js         # query engine and validation results
│   │   ├── ranker.js            # scoring, ratings, explanations
│   │   └── index.js             # analyzeElement(): generate → validate → rank → render
│   ├── generators/
│   │   ├── playwright-generator.js
│   │   └── selenium-java-generator.js
│   ├── popup/                   # Vue 3 popup (Composition API)
│   │   ├── App.vue, main.js, index.html
│   │   ├── composables/useInspector.js
│   │   ├── components/          # InspectorControls, ElementDetails, FrameworkTabs, LocatorList,
│   │   │                        # LocatorCard, HoverPreview, HelpPanel, EmptyState, StatusMessage
│   │   ├── utils/clipboard.js
│   │   └── styles/main.css
│   └── shared/                  # constants, messaging, tab-control (injection/start/stop)
├── tests/
│   ├── unit/                    # Vitest + jsdom
│   ├── fixtures/                # DOM fixtures and e2e pages
│   └── integration/             # Playwright tests that load the unpacked extension
├── scripts/                     # build, validate-dist, package, icons, store screenshots
├── vite.config.js               # popup + module service worker
├── vite.content.config.js       # content script as one classic IIFE
├── vitest.config.js, playwright.config.js, eslint.config.js
```

## Prerequisites

- Node.js 18.18+ (tested with Node 24) and npm
- Google Chrome or Chromium 116+
- For integration tests, Playwright's Chromium: `npx playwright install chromium`

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This rebuilds `dist/` on every change. Load `dist/` once as an unpacked extension (see below), then click the reload icon on `chrome://extensions` after a rebuild. Content-script changes apply to newly injected pages, so reload the tab you are testing.

There is no dev server. Extensions must load built files, so the production and development outputs have the same structure.

## Build

```bash
npm run build
```

This produces `dist/` and then runs `scripts/validate-dist.mjs`, which checks:

- The manifest is MV3, has the required fields, a valid version, a description of at most 132 characters and a 128 px icon.
- Every referenced file (popup, service worker, icons, injected `content/content.js`, HTML assets) exists.
- There are no remote scripts or imports, no `eval` or `new Function`, and no references to a Vite dev server.
- There are no unexpected permissions or `host_permissions`.

## Load the unpacked extension

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `dist/` folder.
5. Pin **Smart Locator Inspector** from the puzzle-piece menu.
6. Open any regular website, click the icon, then click **Start Inspection**.

For local `file://` pages, open the extension's **Details** and enable **Allow access to file URLs**.

## Testing

```bash
npm run lint        # ESLint (also forbids eval / implied eval / new Function in src)
npm test            # Vitest unit tests (jsdom)
npm run test:e2e    # builds dist-e2e/ and runs Playwright against the real extension
npm run check       # lint + unit tests + production build
```

- **Unit tests** cover XPath literal escaping, CSS generation and escaping, duplicate ids, duplicate buttons, elements without ids, form labels, accessible-name heuristics, quotes and special characters, dynamic classes and ids, match counts, target verification, scoring, Playwright and Selenium code generation, malformed selectors, privacy (password and typed values never appear in results) and message validation.
- **Integration tests** (`tests/integration/extension.spec.js`) load the unpacked build in Chromium and verify: manifest and permissions, the popup renders without errors, start, hover, select and "Inspect again", that **real Playwright confirms the match count of every generated Playwright, CSS and XPath candidate**, that page clicks are blocked while inspecting and the page is fully restored afterwards, `Esc` to stop, repeated injection without duplicate listeners, copying the locator, `By` expression and example, "Show matches", reload and navigation handling, and restricted-page messaging.
- The e2e build is identical to the production build except for `host_permissions` on `127.0.0.1` and `localhost`, because automation cannot click the toolbar icon to grant `activeTab`. **Never publish `dist-e2e/`.** The validator warns about it.
- `SMOKE=1 npx vitest run tests/unit/ranking-report.test.js` prints the full ranked candidate list for each fixture, which is useful when tuning the ranker.

## Package for release

```bash
npm run package
```

This builds, validates and writes `release/smart-locator-inspector-<version>.zip` with `manifest.json` at the archive root, ready to upload.

## Privacy model

Privacy is a design constraint, not a setting:

| Topic | Behaviour |
| --- | --- |
| Activation | Only after you click the toolbar icon or press the shortcut, only in the current tab (`activeTab`). No content scripts run automatically on any site. |
| Network | None. No backend, analytics, telemetry or remote code. |
| Page data | Processed in memory inside the tab. Results (strings) go only to the extension's own popup and service worker. |
| Storage | Nothing about pages is stored. The popup keeps only your framework tab preference in its own `localStorage`. |
| Form data | Text input, textarea, select and contenteditable values are never read. Password values are never read. Previews redact emails and long numbers. |
| Logging | No page content is logged. |
| Page changes | None to page elements. A temporary cursor style is removed on stop, and the overlay host is removed. |

## Known limitations

- **Restricted pages**: Chrome blocks extensions on `chrome://`, `edge://`, `about:`, `view-source:`, the Chrome Web Store, other extensions' pages and the built-in PDF viewer. The popup explains this instead of failing.
- **iframes**: the inspector runs in the top frame. Elements inside iframes are reported as the `<iframe>` element. Cross-origin frames would need broad host permissions, which this extension deliberately does not request.
- **Shadow DOM**: elements inside shadow roots are reported as their shadow host. Playwright locators pierce open shadow roots and XPath does not.
- **Accessible names are estimated**. CSS generated content (`::before`/`::after`), `aria-owns`, slot flattening and some host-language edge cases are not modelled. Validation still reports the real match count under our emulation, and the integration suite cross-checks it against Playwright.
- **Selenium `By.linkText`** uses rendered text where available (`innerText`). Exact whitespace and visibility behaviour can differ slightly between drivers.
- **Dynamic pages**: validation reflects the DOM at the moment of selection. Content that loads later can change match counts. Re-select to re-validate, or use **Show matches**.
- **Pages that cancel events in their own capture listeners** before ours may still react to clicks while inspecting.
- **The activeTab grant expires on navigation**: after navigating, click the toolbar icon again.

## Contributing

1. Fork and create a feature branch.
2. Keep responsibilities separated: generation in `engine/*-generator.js`, matching semantics in `validator.js`, scoring in `ranker.js`, language syntax in `generators/`.
3. Add a fixture and unit tests for every new strategy or heuristic. If it affects Playwright semantics, extend the integration cross-check.
4. Run `npm run check` and `npm run test:e2e` before opening a pull request.
5. Do not add permissions, network access, remote code, `eval`, or storage of page content.

## Chrome Web Store publishing checklist

This project has **not** been published. Publishing requires a developer account and Google's review.

1. **Account**: register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time fee) and verify your email.
2. **Metadata**: update `version` in `public/manifest.json` and `package.json`. Set `DOCS_URL` in `src/shared/constants.js` to your public repository or documentation URL.
3. **Package**: run `npm run package` and upload `release/smart-locator-inspector-<version>.zip`. Do not upload `dist-e2e/`.
4. **Listing assets**:
   - 128×128 icon (`public/icons/icon-128.png`, regenerate with `npm run icons`)
   - At least one 1280×800 screenshot: `npm run screenshots` writes candidates to `store-assets/` (replace the fixture page with a real-world demo if you prefer)
   - Optional 440×280 small promo tile
   - Short description (≤132 characters, same as the manifest) and a detailed description
5. **Privacy practices tab**:
   - Single purpose: "Inspect page elements and generate test-automation locators."
   - Permission justifications: `activeTab` gives temporary access to the current tab only after the user clicks the icon or uses the shortcut. `scripting` injects the inspector into that tab on demand.
   - Remote code: **No**.
   - Data usage: no user data is collected or transmitted. Certify compliance with the developer program policies.
   - Privacy policy URL: https://mohammadhamza987.github.io/smart-locator-inspector/privacy-policy.html (served by GitHub Pages from `docs/`).
6. **Pre-submission checks**: `npm run check` and `npm run test:e2e` pass. Load `dist/` unpacked in a clean Chrome profile and test on a few real sites and on a restricted page.
7. **Submit for review**, then monitor the dashboard for review feedback.
