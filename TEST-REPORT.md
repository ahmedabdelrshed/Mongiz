# Validation report

Validated on 2026-10-22.

- Production build passes, including TypeScript checking.
- Vitest: 128 tests across 19 files.
- Chrome: 24 browser tests using mocked Azure HTTP responses.
- All seven screens checked in light and dark at 390px, 768px, 1024px, and 1440px, with 56 screenshots and no horizontal overflow or controls extending outside the viewport.

## Workspace redesign

- Appearance defaults to the device theme, persists explicit preferences across reloads, follows device changes in System mode, and remains usable when browser storage is unavailable.
- Compact navigation and task panels support Escape, focus trapping, and focus restoration. Mobile edits survive panel closure, desktop resizing, and refresh, and are submitted only through Save changes.
- Reduced motion removes panel translation. Collapsed sections remain out of keyboard and screen-reader navigation while preserving form state.
- Compact hour totals preserve independent calculation state and preview staged values. Allocation, Save/Discard, status propagation, and revision-checked updates retain their existing behavior.
- The 500-task list remains virtualized, reaches its final row, and preserves edits through scrolling and refresh. Short lists fit their contents.
- Creation preserves shared inheritance, explicit review, default tasks, successful reset, and partial-failure protections. Template deletion requires confirmation and cancellation preserves the template.
- Current previews: docs/mongiz-light-preview.png, docs/mongiz-dark-preview.png, and docs/mongiz-mobile-dark-preview.png.

## Current request

- Creation always shows the SRS input, with no manual Add Story flow.
- Multiple SRS blocks create separate titles with empty descriptions and nine default tasks each.
- Adding stories clears pasted text and scrolls to shared task owners/estimates.
- Creation batches/results are never automatically persisted; legacy creation caches are removed.
- Navigation/reload and a completed batch reset fields, including the destination project.
- Shared owners/hours propagate; individual overrides remain effective.
- Sign-in connects directly without project/team selection.
- Organization-wide My Work is verified with mocked Agile User Story and Scrum Product Backlog Item projects.
- Creation selects its own project and uses that project's default team and project-wide users, including Graph continuation pages.
- Project discovery loads continuation pages and deduplicates projects.

## Preserved behavior

- Default estimates total 1.7h per story: two implementation tasks at 0.5h and seven other tasks at 0.1h.
- Story/task creation has no tags or Remaining Work. Tasks retain supported Original Estimate.
- SRS parsing handles multiline titles, CRLF/bullets, case/spaces, embedded references, duplicate IDs, preamble warnings and long titles.
- Creation validates before submission, creates parents before tasks, skips successful IDs within the open batch, and blocks uncertain automatic reposts. Legacy marker reconciliation is covered.
- PAT verification, Basic authentication, memory-only token lifetime, configuration-only persistence and disconnect/reconnect are covered with mocked responses.
- Project-scoped Graph pagination, deduplication, group/service/deleted-user filtering, permission failures and repeated-token detection are covered.
- My Work edits remain local until explicit Save and survive reload. Closing a task stages all siblings, including other assignees.
- New/Active tasks stage Completed Work equal to Original Estimate where supported. Validation and optimistic revision checking preserve failed edits and clear successful ones.
- Assigned-work reads expand missing parent stories and all direct child tasks.

## Live validation limit

No real Azure token or Microsoft Entra registration was supplied. Azure request behavior and cross-project scope were tested using mocked HTTP responses, while demo creation/editing flows were tested end to end in Chromium. Actual organization permissions, browser CORS and custom process rules still require a live check.

Current screenshots: docs/desktop-preview.png, docs/mobile-preview.png and docs/my-work-preview.png. Other screenshots may reflect an earlier version.

## Project tabs, selection and points update

- All/project tabs filter groups, clear selection and retain pending edits.
- Select-all supports independent task/story selection and individual exclusions with indeterminate checkbox state.
- Bulk task estimates preserve 0.1h, missing estimates and excluded rows; other eligible rows receive the shared value.
- Story points create payloads use StoryPoints, Effort or Size as supported and omit unsupported fields.
- Story state/points editing stages changes without automatic saving or changing child task states.
- A mocked Azure Chromium flow saves one shared point value across Agile and Scrum stories using different field names and authenticated revision-checked PATCH requests.
- Desktop and mobile bulk menus were visually reviewed; no horizontal overflow at 390px.

## Owner/sprint filters and hour summaries

- Default owner identity, case-insensitive matching, other-user and All users options.
- Current/specific/all sprint filters apply to task rows; hidden siblings remain available for closure.
- Sprint/month sums, decimal rounding, missing numbers, duplicate sprint paths and ambiguous/missing month dates.
- Editable 30–40h range and preference persistence; sprint/project/user changes update summaries.
- A 1,001-item mocked Azure read verifies successive ID-page loading; selected identities are WIQL-escaped.
- Chromium verifies owner/current defaults, user switching, different sprint selection, independent month totals, editable targets and mobile viewport fit.
- Desktop and 390px mobile hour-summary screenshots reviewed.
