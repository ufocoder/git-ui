Easier history and branch management

- Added force push after reset, with confirmation and an exact --force-with-lease check to protect newer remote changes.
- Squashing now supports a linear range extending beyond the current branch tip. The dialog explains the effects and requires confirmation; the original branch and working files can be restored.
- Simplified reset and history rewrite dialogs with clearer descriptions, aligned checkboxes and wider windows. Switching reset modes no longer changes the dialog height.
- The source commit list is collapsed when squashing, and the message field is clearly labeled as the combined commit message.
- Reorganized branch and tag menus. Multiple selected commits now have a dedicated menu for copying SHA-1s, squashing and clearing the selection.
- The selected branch appears first among branches in the history filter; when viewing all branches, the current working branch appears first.
