# Mongiz (منجز) — React Azure DevOps workspace

A frontend-only React + TypeScript app for bulk story/task creation, quick estimates, assignment, personal daily planning and reusable task templates. It opens the Azure connection page before protected features can be used. There is no application backend and no shared secret in the frontend.

## Run locally

Use Node.js 22.12+ (Node 24 also works).

```bash
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Connect your Azure DevOps Services organization using the Settings page. Demo mode is no longer available. Do not open index.html by double clicking; serve the app with Vite or another web server.

```bash
npm test          # Vitest unit + React integration tests
npm run build    # TypeScript check + production build
npm run preview  # Serve dist locally
```

Browser tests:

```bash
npx playwright install chromium
npm run test:e2e
```

The ZIP deliberately excludes node_modules, generated build output and credentials. package-lock.json is included for reproducible npm ci installation.

## Included features

- Move stories: choose any accessible project, search/filter its stories, and move selected stories to any project iteration or backlog. Optionally include direct child tasks by status (none selected by default, including Closed only when explicitly selected). Review exact changes, see per-item results, and retry unfinished changes after refreshing.
- Bulk create multiple stories under a selected Epic → Feature.
- Paste SRS requirements: every new line beginning with an SRS identifier starts a separate story. Review the parsed titles (descriptions start empty) and optionally copy tasks from the first story.
- Set the shared assignee once; tasks inherit it or override it individually.
- Choose Current sprint, Backlog or a specific team sprint. All children inherit the resolved Azure iteration path.
- Add/remove tasks and copy tasks from the first story; manage reusable templates separately.
- Enter decimal hour estimates; see batch story/task counts and total hours.
- Review before submitting; progress remains in memory while the creation page is open.
- Recover partial failures: successful items are skipped, failed items can be retried, uncertain network results require checking Azure manually.
- My Work: assigned stories/tasks, search, status/iteration filters, task state/assignee/Original Estimate/Remaining Work/Completed Work drafts with an explicit Save changes button, and staged bulk assignment.
- Today’s plan: personal task selection scoped by local calendar date.
- My Work edit draft persistence, explicit export/import of creation batches, local task templates.
- Responsive layouts and accessible labels for keyboard and screen-reader use.

## Workspace appearance and navigation

Choose **Light**, **Dark**, or **System** under **Settings → Appearance**. System is the default and follows your device appearance. The preference is remembered in this browser independently of your Azure connection.

The desktop sidebar groups daily work and workspace tools. Below 1024px, use the menu button in the header to open navigation. Task fields remain inline on desktop; on smaller screens, **Edit** opens a labeled task panel. **Done** closes the panel and keeps staged edits; **Save changes** in the bottom bar writes them to Azure. Short work lists fit their contents while large lists remain virtualized.

My Work shows compact sprint totals. Open **Hour settings and breakdowns** for calculation filters, capacity targets, project/month totals, and hour refresh. **Fill sprint minimum** opens the separate list allocation controls. Changing list projects or filters preserves the independent hour settings.

Create Stories uses numbered sections and keeps batch totals and review actions visible. Adding requirements collapses the paste section; use **Add more requirements** to reopen it. The first story starts expanded. Other stories and task templates can be expanded as needed. Confirmation dialogs support keyboard navigation, and animations respect your device's reduced-motion preference.

Current UI previews: [light desktop](docs/mongiz-light-preview.png), [dark desktop](docs/mongiz-dark-preview.png), and [dark mobile](docs/mongiz-mobile-dark-preview.png).

## Azure setup

This release targets hosted Azure DevOps Services (`dev.azure.com`), not on-premises Azure DevOps Server.

### Personal access token (default)

1. Open Azure DevOps → User settings → Personal access tokens → New Token.
2. Select the organization you will use and an expiration date. Enable **Work Items (Read & write)** and **Project and Team (Read)**, and **Graph (Read)**. Your organization may restrict PAT creation; the token cannot grant more access than your account already has.
3. In Mongiz Settings, select **Personal access token (PAT)**, enter the organization name (for `https://dev.azure.com/ezzmed`, enter `ezzmed`) and paste the token.
4. Click **Connect with token**. Mongiz verifies the token owner, then loads projects. My Work reads across accessible projects immediately; no project or team selection is required at sign-in.

Tenant ID and Client ID are not required for this method. The password field is cleared after successful verification. PATs remain only in memory; they are never saved in localStorage, sessionStorage, exported drafts or templates. Refreshing/closing the page ends the token session; reconnect using the same still-valid token. Disconnect clears the token and cached Azure queries while preserving local drafts.

A PAT is sent as HTTP Basic authentication to Azure DevOps Services. All requests are direct browser requests; browser CORS, organization policies and Azure permissions must permit them. A failed connection reports invalid/expired credentials, permission denial or network/CORS failure. There is no backend or development proxy that masks these restrictions.

### Microsoft sign-in (optional)

Select **Microsoft sign-in** in Settings. Existing configurations without an authentication-method field continue to use Microsoft sign-in.

1. In your organization's Microsoft Entra tenant, register an application.
2. Under Authentication, add a **Single-page application** redirect URI matching the exact app origin, such as `http://localhost:5173`. Register the HTTPS origin separately when deploying.
3. Add Azure DevOps delegated API permissions, for example `user_impersonation`, and obtain administrator consent if tenant policy requires it. The app requests the Azure DevOps resource's `.default` scope through MSAL.
4. The signed-in user must already have organization/project access and permissions to create/edit work items. The app does not elevate user permissions.
5. Enter organization **name** (not a full URL), tenant ID and client ID in Settings.
6. Click **Sign in with Microsoft**. My Work reads across accessible projects immediately.
7. Test against a test project first. Live mode explicitly labels changes as Azure changes. Start with one story and one task to verify project rules and CORS in your environment.

Microsoft sign-in requires no client secret or PAT. Client/tenant IDs are configuration, not secrets. Tokens are acquired by MSAL and cached in sessionStorage; tokens are not put in the app's custom localStorage records. An expired session requiring interaction is reported; click Sign in again in Settings.

Metadata is read from Azure: requirement/task types, Epic/Feature categories, parent relationships, project users, supported task fields/states, team Area path, configured backlog iteration and team sprints. If exactly one sprint is active, Current sprint resolves to it; otherwise choose a specific sprint or Backlog. Backlog uses the team's configured backlog iteration path, not a hardcoded label.

Agile calls a requirement “User Story”; Scrum and CMMI use different names. The app resolves the default type from the requirement category. Projects without the Epic → Feature portfolio hierarchy are reported as unsupported. Custom mandatory fields that this form does not supply cause an actionable per-item Azure validation failure; extending the form is required for those processes.

## Storage and recovery

Settings, local task templates, daily plans and My Work edit drafts use localStorage. My Work is scoped by account and organization across projects. Nothing in localStorage syncs across devices. Clearing browser data does not delete Azure work items.

**Create Stories is temporary.** Only the destination project selector appears initially. The full creation form appears after selecting a project and successfully loading its workspace. Creation fields, shared titles/assignees/estimates, pasted text and submission results are never automatically saved. Leaving the page, reloading, starting a new batch or changing its destination project clears the form. A fully successful submission clears every field, including the destination project. Legacy automatic batch/results records are removed when the page opens. Explicit Export downloads a file only when requested; Import creates a new local batch.

Choose the destination project at the top of Create Stories. Its default team supplies Area path, configured backlog path and sprint choices. Sign-in does not require selecting a project/team. Selecting a project does not change the organization-wide My Work view.

New stories and tasks have no tags or Remaining Work hours. Tasks receive supported Original Estimate hours. During an open batch, successful IDs are skipped on retries and uncertain outcomes block automatic reposts. Check Azure manually before using “I verified it was not created”. Do not leave/reload a partially submitted batch before recording its IDs or exporting it: the current form and recovery IDs will be lost, while created Azure items remain. Legacy imported tagged batches can still use read-only marker reconciliation.

A partially submitted batch is locked to preserve relationships. Web Locks coordinate submission where supported; there is no server transaction. A lost response to an untagged create cannot be automatically reconciled.

## Hour fields

For task creation, hours are sent to Original Estimate **only when that field exists** in the project task type. Completed Work is not filled automatically. Story points are separate and are not converted from hours. Unsupported hour fields are disabled in My Work and called out in the creation form. Descriptions/acceptance criteria are stored as escaped plain-text HTML in System.Description.

## Feature-based architecture

```text
src/
  app/                 App shell, providers, routing, global styles
  features/
    auth/              In-memory PAT sessions and optional MSAL sign-in
    project/           Connection settings and selection
    bulk-create/       Draft rules, nested editors, validation, submission
    my-work/           Assigned items, inline and bulk task editing
    daily-plan/        Local-day planning rules
    templates/         Local reusable task sets
  shared/
    api/               Repository contract, Azure REST repository and test-only fixtures
    storage/           Versioned localStorage helpers
    ui/                Shared feedback and page components
  test/                Shared test setup
```

TanStack Query handles remote reads/refetching. Nested form state uses React state with Zod validation; there is no extra form library dependency. Hash routing permits ordinary static hosting without route rewrite rules.

## Current limits

- Live Azure requests cannot be verified without your Entra registration and work account. Browser CORS, tenant consent and organization policy must be confirmed in your environment.
- My Work loads accessible work items using successive ID pages of 1,000 and 200-ID detail batches. Portfolio selectors remain capped at 1,000 records; the project list loads every continuation page. Large organizations can take longer to load.
- Assignee options load users from the whole selected project through Azure DevOps Graph, independently of the selected team. Every page is loaded using the project scope descriptor; duplicates, groups, deleted users and built-in service accounts are excluded. A Graph authorization failure displays a Graph (Read) permission message instead of falling back to a short team list. Azure still validates assignment permissions when saving.
- Custom required fields, hierarchy without Epic/Feature levels, attachments, comments, notification delivery and AI estimation are outside this release.
- In My Work, New and Active tasks automatically stage Completed Work equal to Original Estimate when supported. These values only reach Azure after clicking Save changes. Remaining Work changes only when edited explicitly.
- No automatic background replay of mutations. Creation requires an explicit reviewed submit.

## References

- [Microsoft's JavaScript Azure DevOps authentication sample](https://github.com/microsoft/azure-devops-auth-samples/tree/master/JavascriptWebAppSample)
- [Microsoft Entra OAuth for Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth)
- [Create work items REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1)
- [Team settings and backlog iteration](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/teamsettings/get?view=azure-devops-rest-7.1)

## Paste SRS stories

Select a **Destination project**, then paste requirements in **Paste SRS stories**, such as:

```text
SRS.7.7.48: Create Transform Work Order
Allow selection of multiple work standards.

SRS.7.7.49: Show inactive work standards
Display an indicator for inactive records.
```

This produces two story drafts. All text in each SRS block, including the SRS code and following lines, becomes the story title. Line breaks are replaced with spaces. The description is left empty. The shared Epic/Feature, assignee and destination apply to both. References to SRS IDs in the middle of sentences are not split into new stories. Start each new requirement on its own line.

Bullets, Windows line endings, lowercase IDs, and IDs written as `SRS 7.7.48` are accepted; codes are normalized to `SRS.7.7.48`. Repeated IDs in the pasted text or the existing batch are reported before adding. Text preceding the first ID is explicitly called out and not imported. Titles longer than 255 characters are kept in full and flagged. Shorten them in the story editor before Azure creation; no text is moved into the description. Limits: 100 pasted stories and 200,000 total characters.

By default, every pasted story receives nine tasks: Implement frontend requirements (0.5h), Implement backend requirements (0.5h), Link frontend source code (0.1h), Link backend source code (0.1h), Frontend static code analysis (0.1h), Backend static code analysis (0.1h), Unit testing (0.1h), Frontend code review (0.1h), and Backend code review (0.1h). The initial total is 1.7h per story. Choose **Tasks for pasted stories → Copy tasks from the first story** or **No tasks** to override this default. Each copied/default task gets its own ID. The paste tool creates local drafts only; Azure creation still requires Review batch and explicit submission.

## Shared assignees for default tasks

The **Shared tasks** section at the top of Create stories has an editable title, an assignee selector and an estimate input for each of the nine task types. Frontend tasks occupy one column and backend tasks another, with unit testing below. The columns stack on smaller screens. Initially, every assignee selector uses **Same as story assignee**. Choose different users for frontend/backend implementation, source-code linking and static analysis if needed.

Shared title changes update inherited tasks in existing and newly added stories. Editing a task title inside a story creates an individual override. Click **Reset** below that title to restore the shared title. Exported drafts retain shared titles and overrides; Azure receives the titles displayed in the story editors.

Each standard task uses **Shared task assignee** by default. Changing a shared selector updates all tasks of that type that still inherit it, including stories already added to the draft. Explicit individual task choices (including Unassigned) are retained. To restore inheritance for an overridden task, choose **Shared task assignee** again. The effective inherited user is shown in that option.

Shared assignment values and individual overrides remain only in the current creation form. These shared controls edit unsubmitted drafts only; once batch creation begins, the draft is locked to preserve recovery identity.

Shared estimates update all default tasks that still inherit hours, including tasks already in the draft. Editing a task's hours creates an individual estimate override; that value is preserved when shared hours change. Click **Reset** below that task's hours to restore inheritance. **Shared** indicates that hours currently follow the top settings. Shared owners and shared estimates are independent: overriding one does not override the other. Creation values and overrides clear on navigation/reload. Azure receives the resolved estimates when supported. Old tasks without estimate-inheritance metadata keep their saved hours until explicitly reset.

- [Azure DevOps personal access tokens](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops)

- [Project-scoped Azure DevOps Graph users and pagination](https://learn.microsoft.com/en-us/rest/api/azure/devops/graph/users/list?view=azure-devops-rest-7.1)

## My Work: explicit Save and story groups

My Work reads accessible stories/tasks across projects, fetches missing parents and all direct child tasks, and filters displayed rows to the current token owner and current sprint by default. Use Filter user for another user or All users, and Filter destination for another sprint or All iterations. Related story/task reads use batches of up to 200 IDs. API access errors stop loading rather than silently showing incomplete sibling lists.

Task edits and bulk assignments stay in a browser-local draft until you click **Save changes** at the top. Unsaved rows are marked and the button shows their count. Drafts survive navigation/reload and retain each item's original Azure revision to detect conflicting updates. Refresh remains available with pending edits and preserves them. It is disabled only during saving or an active list refresh. Save retains revision checks to catch Azure conflicts. Today task selections remain local preferences.

Choosing **Closed**, **Done**, or **Completed** on one task stages that state only for that task. Bulk state changes apply only to explicitly selected tasks in the current view. Other tasks under the same story keep their state and completed hours, including unselected tasks assigned to you and hidden tasks assigned to other users. Saving leaves the parent story state unchanged.

Completed Work is set to the current Original Estimate only when a task status is explicitly changed and the field is supported. Loading, filtering, refreshing, assignment changes and estimate-only edits do not generate completed-hour changes. Closing a task updates completed hours only for that task. Bulk status + estimate changes use the newly entered estimate. Completed Work can also be edited manually. Save is still required to write any of these changes to Azure.

All edits are validated before saving. Each task uses a revision check. Successful saves clear their draft entries; failed entries remain available, with item-specific errors. A multi-task save can partially succeed because Azure updates are separate requests. A permission failure cannot be bypassed by the UI. If Azure reports a revision conflict, discard and refresh before reapplying the edit.

Current My Work screenshots: `docs/my-work-preview.png` and `docs/my-work-mobile-preview.png`.

## Paste-first creation

There is no separate manual Add Story flow. Select a destination project, enter multiple SRS blocks and click Add stories to batch. The input clears after adding them and the screen moves to Shared tasks. Set shared task titles, owners and estimates there; individual task overrides are retained. All creation fields reset for the next completed batch.

## My Work project tabs and bulk editing

My Work search trims whitespace and matches titles without case sensitivity. Search an ID with or without `#`. A matching story shows its tasks that satisfy the user, sprint, and status filters; matching tasks keep their parent story for context. Today's plan still shows only planned tasks.

**Fill sprint minimum** uses all tasks matching the list filters and search, including closed and offscreen tasks. It fills each project/sprint separately to the saved minimum target (30h by default), independently of hour-calculation filters and checkbox selection. **Auto** chooses implementation tasks per story, falling back to testing and then code review when needed. Choose **Implementation**, **Testing**, or **Code review** to restrict the category. Classification uses task titles; custom titles without those words are reported as unmatched.

Category buttons allow multiple selections, such as **Implementation** and **Code review** together. Added hours are shared across all eligible tasks in the selected categories. Choosing **Auto** clears manual selections and restores the per-story fallback order; deselecting the last manual category also restores Auto.

All filtered estimates count toward the sprint total. The missing hours are added to eligible tasks in equal shares, rounded to 0.01h with remainders assigned by task ID. Completed Work is matched to every filtered task's Original Estimate, including tasks receiving no added hours and sprints already at target. State and Remaining Work are preserved. Missing estimates count as zero for allocation; tasks that still have no estimate retain their Completed Work. Tasks at 0.1h are eligible for this action. Adding hours requires support for both hour fields; matching existing estimates only requires Completed Work support. Backlog items are skipped. Sprints without eligible categories retain their estimates while supported completed hours are matched. Invalid hour drafts must be corrected first. The action stages drafts only: **Save changes** writes to Azure, and **Discard changes** restores saved hours.

My Work starts on **All**, followed by a tab for each accessible project. Switching tabs filters the displayed groups and clears selection; staged edits remain until Save or Discard. Search/status/iteration changes also clear selection.

Above the list, **Select all tasks** and **Select all user stories** select items displayed in the current view. You can uncheck individual rows afterward; the top checkbox shows partial selection. Task and story selections are independent and can coexist.

The task selection menu stages shared assignee, state and Original Estimate values in one action. Empty numeric values and Keep current options mean no change. A shared estimate applies only to selected tasks with an existing estimate different from **0.1h** and a supported Original Estimate field. Tasks with no estimate are skipped. The exclusion value is `BULK_ESTIMATE_EXCLUDED_HOURS` in `src/features/my-work/edits.ts`; change it there for future requirements. Individual row editing remains unrestricted by this bulk rule. Closing selected tasks affects only those tasks; unselected tasks under the same story remain unchanged.

The story selection menu stages the same state and/or points number on every selected story. Only state values supported by every selected project's story type are offered. Points use each project's supported Story Points, Effort or Size field; unsupported stories are skipped for points and reported. Changing story state leaves child tasks unchanged. Story cards also provide individual state/points fields.

Create Stories provides a Story points input on each story. Leaving it empty omits the points field; 0 is a valid explicit value. Points are independent of task estimates and are validated between 0 and 10,000. Creation fields continue to be temporary.

All My Work bulk changes require **Save changes**. Saves use each item's original revision; partial failures keep failed drafts available. Current bulk screenshots: `docs/my-work-bulk-preview.png` and `docs/my-work-bulk-mobile-preview.png`.

## Owner, sprint and month hours

My Work and Today's plan default to **My tasks** (the verified token owner) and **Current sprint**. Another project user or All users can be selected. The sprint selector includes configured sprint paths, backlog and All iterations, plus loaded paths without dates. Task rows must match these filters; a parent story can still appear to provide context. Filter changes clear selection and preserve existing edit drafts. Closing a task does not change hidden tasks.

Sprint metadata comes from each project's default team. If no current sprint is configured, the view is empty with a message; it does not silently show all iterations. Loaded sprint paths without dates can be selected but cannot produce a month summary. Different teams with different sprint schedules may require adding their iteration metadata.

**Hour calculations** defaults to one combined **Current sprint** card across all accessible projects for the selected user. Only tasks whose sprint start and finish dates contain today's local date contribute, including both boundary days. For example, on **12 May 2026**, estimates and completed hours are summed across project sprints containing that day; past, future, undated, and invalid-date sprints are excluded even if Azure marks them current. The displayed date updates at local midnight and when the window regains focus. Each task is counted once, and the **30–40h** target applies once to the combined total. The target is editable and remembered per account/organization; invalid inputs keep the last valid range. User, project, and sprint calculation controls remain independent of list filters. Pending local edits update totals immediately; Discard restores saved values. Unset numeric fields contribute zero, and tasks without Original Estimate are counted separately. Explicitly selecting other sprints calculates their combined total instead of today's sprints.

**By project** cards below the combined total show each project's estimated and completed hours using the same selected user, projects, and sprint dates. Multiple matching sprints in one project are summed into its single card. Project bars show each project's contribution against the combined capacity target.

The separate **Month totals** section starts collapsed. Expand it, or choose Calculation months, to view whole sprints starting in each selected month, counted once per path. Its capacity range is four times the configured sprint target. Monthly totals are independent of the current-day total and are not hours logged by completion date or prorated across month boundaries.

Work-item loading traverses all ID pages to avoid a first-1,000-only hour total. API failures stop loading. Azure permissions and process field support still apply. Current screenshots: `docs/my-work-hours-preview.png` and `docs/my-work-hours-mobile-preview.png`.


## Shared work loading and local filtering

Use **Export Excel** on My Work or Today's plan to download the current filtered view as an `.xlsx` workbook with **User Stories** and **Tasks** sheets. The export includes every matching row, including rows outside the scroll viewport and parent stories shown for context. Checkbox selections do not restrict the export. Choose **Show all loaded items** to export all items from the loaded projects. Columns include IDs, project, type, title, state, assignee, iteration, parent ID, story points or task hours, and tags. Titles link directly to their work items in Azure DevOps; parent story titles link to the corresponding story. There are no separate URL or Unsaved columns. Pending local edits are included; exporting does not save them to Azure. Export is unavailable while loading or saving, after a loading failure, or when the view is empty.

The workspace provider loads all accessible stories and tasks into one global React Query snapshot after project metadata is ready. My Work shows an accessible loading state until the initial full load finishes; changing local filters does not request another work-item load. Status choices combine supported project states with loaded states, so a zero-match view does not erase the dropdown options. Loaded counts and **Show all loaded items** distinguish empty filters from missing data. Errors have explicit retry controls.

Azure work-item classification receives the cached project configuration explicitly, so a new repository instance still recognizes Scrum backlog items and custom story/task types. If no project types can be read, loading fails visibly instead of returning an empty successful result. Partial project metadata errors remain visible as warnings.


## Project-scoped Azure loading

My Work now queries each accessible project directly using its project ID and `[System.TeamProject] = @project`, without server-side owner, sprint, state or type restrictions. It pages all results, then keeps every type in the project requirement/task categories (including non-default category types). Other portfolio/test types remain outside My Work. Project loading errors stop the full load and show the failing project; they are not treated as a successful zero count. A completed zero result identifies the organization, connected user and queried projects, with a reload action.


## Choose My Projects

In Azure mode, sign-in lists accessible projects but does not load their work items. Open **My Work**, check your projects, and click **Load selected projects**. The list loads only those projects and its All tab is limited to that selection. The independent hour panel loads all accessible projects when My Work opens, including projects outside the list selection. Selection is remembered in localStorage per account/organization. Accessible projects are not automatically treated as your projects: choose the ones you work on. The shipped app has no demo mode.

Use **Change my projects** to update the selection. Pending edits survive project changes. Save applies them across projects, including hidden items, using the all-project snapshot; Discard clears the shared draft. Error screens retain the project picker so you can remove an inaccessible project. Creation still has its own destination project selector. Query cache keys include the chosen project IDs, so switching projects cannot reuse another selection's dataset.


## Independent all-project hours

The hour panel has its own metadata/work query keys and loading/error/refresh state. It loads saved task hours plus the shared local edit draft across all projects accessible to the connected token. Its user, project, sprint, and month controls are independent of the list. Switching list projects or filters preserves the hour controls. Data edits, calculation controls, and the current date determine totals. Saving updates all cached list selections and the hours snapshot; creation invalidates both datasets. Default user remains the token owner.


## Virtual task list and Azure-only startup

My Work and Today use react-window 2.2.7, rendering story headers and individual task rows with overscan. Rows are measured with ResizeObserver to support long titles and mobile layouts. Selection, bulk actions and edit drafts remain outside the virtual rows, so they also apply to offscreen items and survive unmounting/scrolling. The list has its own scroll viewport. Desktop navigation is fixed to the viewport; mobile navigation remains at the top while scrolling.

The production app always uses Azure. A fresh visit, disconnected protected route, or PAT reload redirects to Settings. Legacy demo settings are treated as Azure settings. Test repositories are injected only under Vitest, and no demo data repository is imported into the production app.

The Refresh button was previously disabled by any pending draft, including the automatic Completed Work corrections used in earlier releases. Those load-time corrections have now been removed. It now reloads list data and all-project hours while retaining draft fields and their original revision. Use Save to submit; if another user changed an item, Azure revision validation still rejects the conflicting save. Browser tests exercise 500 tasks, reaching the last row, preserving edits when scrolling/refreshing, fixed sidebar positioning, project switching and Azure startup.

## Local closure preview

My Work shares one edit draft between the virtual task list and the all-project hour panel. Changing a task status stages Completed Work equal to its current estimate only for the edited or selected tasks. The hour cards immediately calculate from the effective saved-plus-draft items without writing to Azure. Save promotes changes to the saved caches; Discard removes the preview. Refresh preserves the shared draft and its original revisions. Existing drafts from an earlier release remain intact; Discard clears old pending values, including closures staged by the previous sibling rule.
