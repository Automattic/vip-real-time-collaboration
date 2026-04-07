# Local updates block with syncing of external state

This code example shows how external editor state can be synced between peers during collaborative editing. Normally, a block's state is stored in its own attributes, which are automatically synced. However, sometimes a block deals with external state outside of its attributes, for example, a list of posts or data from an external API.

## Wikipedia edits

This code example registers a "Wikipedia edits" block, which allows someone who places the block to load recent Wikipedia edits from their API. Whenever a user loads or refreshes the block, collaborators will see the same data.

A complete implementation would provide a `Save` function and a dynamic render callback to render the latest edits on the front end. This example focuses on the editor experience.

## Syncing

The external state (Wikipedia edits) is not synced by WordPress. Instead, the block uses a `lastUpdated` timestamp attribute as a signal to other peers that they need to refresh their state. A `useEffect` hook watches for changes to this attribute; when it changes, the block fetches updated data from the Wikipedia API.
