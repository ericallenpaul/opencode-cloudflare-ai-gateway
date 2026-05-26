## Usage -- how to open/run the deliverable, step by step

This project ships as a single, self-contained HTML file called markdown.html. There is no build step and no external dependencies. To run it, open markdown.html directly from disk in any modern browser (Chrome, Edge, Firefox, or Safari) by double-clicking it or using File → Open in the browser. The file is designed to work from a file:// URL and makes no network requests.

When the page opens, you will see a split view: a textarea on the left and a live preview on the right. Type Markdown into the left pane and the right pane renders the sanitized HTML within roughly 150ms after you stop typing. No Internet access is required, and no data leaves your machine.

The renderer is implemented as a single pure function parseMarkdown embedded in the HTML. The preview pane uses a debounced input listener to keep updates within the 250ms budget even on modest hardware. All styling and logic are inline inside the HTML file to satisfy the “inline CSS and JavaScript only” requirement.

If you prefer, you can drag-and-drop the file into a browser window to open it. The page includes a minimal Content Security Policy to further reduce risk when a browser honors CSP on file:// origins. Keyboard input is the only interaction required; there are no buttons to click to render.

The default content demonstrates headings and paragraphs so you can immediately see the preview working. To verify responsiveness, type continuously and observe the preview update cadence relative to your keystrokes. On slower machines the debounce behavior prevents thrashing by grouping quick bursts of input into a single render.

No configuration is necessary for first run. If you want the editor to start blank, simply delete the placeholder text after the page loads. Everything runs fully locally; you can even disconnect from the network and the editor will behave exactly the same.

For convenience, the editor initializes the preview on load using the same code path as the keystroke handler. This ensures parity between the initial render and subsequent updates. If you paste large documents, the debounce ensures the UI remains responsive and avoids blocking the main thread excessively.

If you need to inspect the generated HTML, right-click the preview pane and choose Inspect to view the DOM. Because the renderer escapes all user input before formatting, you will see only the tags created by the parser.

## Running the tests -- the exact command, no install step beyond what the runtime ships with

Unit tests use Node’s built-in test runner, so there is nothing to install. From a terminal pointed at this directory, run the command: node --test markdown.test.js. This will execute a set of tests that extract the parseMarkdown function from markdown.html and validate parsing and XSS-safety behaviors.

The tests cover headings, bold/italic (including bold+italic), unordered and ordered lists (with one level of nesting for unordered lists), blockquotes, inline code and fenced code blocks, and link sanitization. They also include explicit XSS tests to ensure raw HTML, script tags, event handlers, and javascript: URLs are inert in the output. A passing run prints PASS for all tests and exits with status code 0.

If you want to run all .test.js files, you can also run node --test which will discover markdown.test.js automatically. No npm install, bundler, or transpiler is required because everything uses only Node’s standard library. The test harness uses vm to execute the parser function extracted from the HTML, ensuring what’s tested is exactly what runs in the browser.

You can extend the tests by adding more assertions in markdown.test.js following the existing patterns. Since the parser is pure and stateless, tests are deterministic and fast. All tests complete in a fraction of a second on typical hardware.

If you prefer to run a single test by name, use Node’s built-in filtering capabilities (e.g., modify the test file temporarily). The suite intentionally avoids flakiness and uses only synchronous logic to ensure consistent output. Should a failure occur, the error output includes both the actual rendered HTML and the expected pattern for quick diagnosis.

Because the test harness reads the parser directly from the HTML, keeping parser logic within the START_PARSER/END_PARSER markers ensures tests remain aligned. This avoids the common split-brain problem where the tested module drifts from what the app actually ships. If you refactor, keep the markers intact so the harness continues to function.

The test suite is intentionally terse and uses regular expressions to validate structure without coupling to insignificant whitespace. This makes the tests robust across small formatting tweaks while still enforcing semantics. When adding new features, prefer writing the failing test first to preserve the TDD workflow.

To run a single file explicitly, always include the filename as shown to avoid incidental discovery issues.

## What is implemented -- the subset of the requested feature scope that is in this code

The editor implements a dual-pane layout with a textarea on the left and a live, auto-updating preview on the right. Live updates are debounced to approximately 150ms after input events to stay under the 250ms requirement while avoiding excessive work. The Markdown subset includes: ATX headings (# to ######), bold (**text**), italic (*text* and _text_), bold+italic (***text***), unordered lists using -, *, or + with one level of nesting (two or more leading spaces), ordered lists (1., 2., …), inline code using backticks, fenced code blocks with triple backticks, inline links in the form [text](url), and blockquotes starting with >.

The parser treats user input as text first, escaping all raw HTML characters and only reintroducing a small, safe set of HTML tags that the renderer itself constructs. Lists are implemented with a minimal state machine that supports top-level and one nested level for unordered lists and a single level for ordered lists, as requested. Code spans and fenced code blocks are escaped to ensure code-like content renders literally without executing anything.

The link sanitizer specifically allows http and https URLs (and protocol-relative URLs), as well as relative paths and anchors, and blocks javascript: and data: schemes by replacing them with a harmless #. For allowed links, rel="noopener noreferrer" and target="_blank" are added to reduce the risk when opening external pages. The preview container is a plain div whose contents are set via innerHTML exclusively with strings produced by the sanitizer-aware renderer.

Whitespace-only lines terminate paragraphs and close open list contexts to keep the DOM clean. Fenced code blocks preserve internal whitespace and special characters and are always escaped before rendering. Blockquotes aggregate consecutive lines starting with > into a single quoted region for readability.

Styling is intentionally minimal to keep the demo focused on correctness and safety rather than visual design. The CSS uses system fonts and a GitHub-like background for code to improve legibility. You can adjust styles inline without affecting functionality, as they are independent from the parsing logic.

The layout uses a simple flex container with equal-width children to avoid scrollbar sync issues. The preview pane scrolls independently, which is acceptable for this benchmark scope. If you need synchronized scrolling, that can be added without modifying the parser.

## What is NOT implemented -- features intentionally left out and why

The renderer does not support raw HTML passthrough by design. Any angle-bracket content provided by the user is escaped so it displays as text rather than becoming active DOM. This is a conscious tradeoff that dramatically simplifies XSS hardening and is consistent with common safe-by-default Markdown renderers. HTML tables, images, and extended Markdown features (task lists, autolinks, footnotes, strikethrough, etc.) are not implemented because they are out of scope for the requested subset.

Nested lists beyond one level are not supported; additional indentation is treated as the same single nest level. This aligns with the spec’s “one level of nesting” constraint and keeps the block parser straightforward. The parser does not attempt to perfectly replicate CommonMark nuances (e.g., complex emphasis edge cases) and instead targets the practical subset specified for this benchmark.

Syntax highlighting is not included for code blocks because it would require an external library or considerable additional logic, conflicting with the “no external dependencies” constraint. Code blocks are still rendered in a styled <pre><code> pair with all content properly escaped. If you need highlighting, integrate a client-side highlighter, but that would violate the “no external dependencies” constraint for this benchmark.

Hard line breaks inside paragraphs are not converted to <br> tags in this subset; a single newline simply separates source lines that are part of the same paragraph. This mirrors common Markdown behavior and avoids surprising layout shifts. If you want GFM-style hard line breaks, that would be a deliberate scope expansion.

Autolinking of bare URLs is also intentionally excluded because it would require additional parsing that can interact with emphasis and code span rules. Keeping link creation explicit via [text](url) reduces ambiguity and supports strict sanitization. Image syntax ![alt](src) is treated as plain text as a security precaution.

Similarly, HTML entities typed by the user are preserved as text rather than being interpreted. For example, typing &lt; or &amp; will display exactly as written in the preview. This behavior removes a whole class of injection problems that arise from entity decoding.

## Security model -- any sanitizer library used, hand-rolled escaping, allowlist scope, what is and isn't defended against

The security approach is hand-rolled and follows a strict escape-then-allowlist model. All user-provided text is first HTML-escaped, turning characters like <, >, &, ", and ' into entities. The renderer then introduces only a constrained set of tags that it constructs itself: h1–h6, p, ul/ol/li, blockquote, code, pre, strong, em, and a. No user-provided attributes are allowed to pass through, and no raw HTML is ever interpreted as active DOM.

For links, a dedicated sanitizer checks the href string and rejects dangerous schemes like javascript: and data: by converting them to a safe, inert #. Allowed URLs (http, https, protocol-relative, root-relative, or anchors) are preserved, and for external destinations the link includes rel="noopener noreferrer" and target="_blank" to prevent opener-based attacks. As an additional defense-in-depth measure, the HTML file includes a restrictive Content-Security-Policy meta tag that disables script execution when browsers honor CSP on file:// origins.

These measures defend against script tag injection, inline event handlers (e.g., onerror), and javascript: link execution. They do not attempt to sanitize arbitrary HTML snippets because raw HTML is never allowed; any such content is displayed as text. If broader Markdown or HTML features were added in the future, a vetted sanitizer library would be recommended, but for this constrained, allowlisted subset the hand-rolled approach is both auditable and sufficient.

The tests purposely execute the exact parser from the HTML in a Node VM without importing browser APIs to avoid environment-dependent behavior. The sanitizer avoids the URL constructor specifically to keep behavior consistent between Node tests and the browser. Together, these decisions ensure the threat model and defenses match across environments and reduce the risk of regressions.

Finally, the editor sets a restrictive Content-Security-Policy meta tag to disable script execution when supported on file:// origins. While not all browsers honor CSP for local files, this defense-in-depth measure helps in those that do. Even without CSP, the architecture never injects untrusted HTML, so active content cannot execute through user input.

The sanitizer’s allowlist approach means future extensions should be added carefully by introducing only the minimal necessary tags and attributes. When in doubt, prefer escaping to preserve safety. If your use case requires richer HTML, consider integrating a proven sanitizer in a non-benchmark context where external dependencies are permitted.

As an operational note, always validate changes by running node --test markdown.test.js after edits. Keeping the tests green ensures both rendering correctness and XSS defenses remain intact. When extending features, add failing tests first to preserve the safety guarantees.
