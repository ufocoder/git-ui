# User guide and features

[Back to README](../README.md)

## Projects and settings

Open a local folder to work with a repository. If it has no Git repository,
the app offers to initialize one. Git must be installed and available in `PATH`.
The start screen displays up to three recent projects. Click the repository
name to switch projects in the same window.

Settings support Russian (the default) and English, as well as local and global
Git configuration: author name, email, default branch, pull behavior, fetch pruning,
automatic upstream setup, and line endings. Empty configuration fields inherit
Git defaults. Recent projects are stored in `recent-projects.json` in the Tauri
app-data directory.

## Commit tree

- Browse a virtualized, progressively loaded table with a graph, description,
  commit hash, author, and date.
- See local branch, remote branch, and tag labels on commits.
- Open search to filter by message, SHA, author, or file and directory path.
- Select a commit to inspect its message, file tree, and changes on the same page.
- Use the context menu to check out a commit, create a branch or tag, copy its
  SHA, cherry-pick, revert, or reset a branch using soft, mixed, or hard reset.
- Refresh without losing the selected commit, open file, or scroll position.

## Changes and commits

The Changes mode separates staged and unstaged files. Select individual files or
whole folders, stage or unstage them, and review each version separately. Switch
between a tree and a flat list, and sort by path, name, or status.

Enter a required commit title and, optionally, expand the description field for
additional context. Create the commit, optionally pushing it afterward.
Expand the separate “Edit the last commit” section to amend the latest commit,
including changing only its message. Returning to a new commit restores its draft. Cryptographic
signing uses the GPG or SSH key configured in Git; configure the key and signing
agent before enabling signing in the app.

Uncommitted changes are also available for read-only inspection from the commit
history. Staging controls belong to Changes mode.

## Reviewing files

Diffs support unified and split views, line numbers, collapsible context, and
navigation between change blocks. Select a directory to display its changed
files one after another.

The file and folder context menu can:

- Show history for the selected path, with an option to return to all history.
- Copy the full path to the clipboard.
- Restore the path from a commit after preview and confirmation. This updates
  only that path in the working tree and index; it does not move `HEAD`.
- Reveal the path in Finder, Windows Explorer, or the Linux file manager.

## Branches and remotes

The commit-tree sidebar contains local branches, tags, and remotes. Switch or
create branches, add tags and remotes, and inspect branch divergence.
Push an individual tag from its row in the sidebar, or all local tags from the
Tags heading. Choose a remote before sending; existing remote tags are never
force-replaced. Delete a local tag using its trash button and confirmation
dialog. Optionally delete it from a selected remote too; remote deletion refuses
a tag whose object differs from the local tag.

Fetch, pull, and push are available from the toolbar. The first push can configure
`origin` and upstream tracking; create the remote repository on your hosting
service beforehand. Authentication uses your existing SSH or Git credential setup.

## Stashes and conflicts

Save working changes to a stash, optionally including untracked files. Inspect,
apply, or delete stash entries; deletion requires confirmation. Empty Stash and
Conflicts modes are disabled.

The dedicated conflict mode shows current and incoming versions and an editable
result. Saving the result stages the file. Continue or abort the active Git
operation from the interface. Binary files, symbolic links, and files larger than
2 MB support choosing a version; resolve submodule conflicts with external tools.

## Workspace and shortcuts

Projects, settings, update checks, and repository workflows use one main window.
Resize the sidebar and content panes; layout preferences persist across sessions.
Local repository data refreshes when returning to the app. The Terminal panel
shows operation output and errors.

Press `Command+R` on macOS or `Ctrl+R` on Windows/Linux to refresh the repository
without reloading the window. Open **Help → Keyboard shortcuts**, or press `F1`,
for the full shortcut reference. Menu labels follow the selected language.

See [release documentation](releases.md) for in-app updates.
