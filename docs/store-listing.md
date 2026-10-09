# Chrome Web Store listing – copy & paste

## Item name
Smart Locator Inspector

## Summary (max 132 chars, same as manifest)
Hover any element to get validated, ranked Playwright and Selenium Java locators. Runs locally; no page data leaves your browser.

## Category
Developer Tools

## Language
English

## Detailed description
Smart Locator Inspector helps QA engineers and automation developers find reliable locators in seconds.

Click the icon, start inspection, hover any button, link, input or dropdown, and click to select it. The extension generates multiple locator candidates, validates each one against the live page and ranks them by reliability.

WHAT YOU GET
• Playwright: getByRole, getByLabel, getByPlaceholder, getByTestId, getByText, CSS and XPath – including scoped locators for repeated rows (e.g. a "Delete" button in every table row)
• Selenium Java: By.id, By.name, By.cssSelector, By.xpath, By.className, By.linkText
• Match count and uniqueness check for every locator – only locators that match exactly your selected element are recommended
• Stability estimate that flags auto-generated ids, hashed CSS classes, positional indexes and number-based text
• Ratings: Recommended, Good, Acceptable, Fragile, Unverified – with a short explanation
• Copy the locator, or a ready-to-use example (click, fill, check, sendKeys…)
• "Show matches" outlines every element a locator matches on the page
• Keyboard shortcut: Alt+Shift+L

PRIVACY FIRST
• Runs only when you start it, only in the current tab
• No account, no server, no analytics, no remote code
• Never reads passwords or text you type into forms
• Nothing about the pages you inspect is stored or sent anywhere

Note: Chrome does not allow extensions on browser pages (chrome://), the Chrome Web Store or the PDF viewer.

## Privacy practices tab

Single purpose:
Inspect elements on the current web page and generate validated test-automation locators (Playwright and Selenium).

Permission justification – activeTab:
Gives temporary access to the current tab only after the user clicks the extension icon or presses its shortcut, so the inspector can read element attributes and generate locators.

Permission justification – scripting:
Injects the inspector script into the active tab on demand when the user clicks "Start Inspection". Nothing is injected automatically.

Are you using remote code? → No, I am not using remote code.

Data usage: tick NONE of the data types. Certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).

Privacy policy URL: https://mohammadhamza987.github.io/smart-locator-inspector/privacy-policy.html

## Assets to upload
- Store icon 128×128: public/icons/icon-128.png
- Screenshots 1280×800: store-assets/screenshot-1-hover.png, store-assets/screenshot-2-selected.png (run `npm run screenshots` to regenerate)
- Package: release/smart-locator-inspector-1.0.0.zip (run `npm run package`)
