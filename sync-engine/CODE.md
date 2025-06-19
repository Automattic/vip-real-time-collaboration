# Status of the sync experiment in Gutenberg

The sync package is part of an ongoing effort to lay the groundwork of Real-Time Collaboration in Gutenberg.

Relevant docs:

- https://make.wordpress.org/core/2023/07/13/real-time-collaboration-architecture/
- https://github.com/WordPress/gutenberg/issues/52593
- https://docs.yjs.dev/

## Enable the experiment

The experiment can be enabled in the "Guteberg > Experiments" page. When it is enabled (search for `gutenberg-sync-collaboration` in the codebase), the client receives three new pieces of data:

- `window.__experimentalEnableSync`: boolean. Used by the `core-data` package to determine whether to bootstrap and use the sync provider offered by the `sync` package.
- `window.__experimentalEnableWebrtcSync`: boolean. Used to enable WebRTC collaboration.
- `window.__experimentalCollaborativeEditingSecret`: string. A secret used by the `sync` package to create a secure connection among peers.

If collaborative editing is enabled, the autosave interval is set to 5 seconds.
The changes are pulled using the heartbeat API. In order to get a
better real-time experience, reduce the autosave and heartbeat interval.

## How it works

In order to create a Google-Docs-like collaborative editing experience in
Gutenberg, we need to keep track of edit history. If needed, we need to resolve
conflicts from concurrent actions. Example:

- User 1 inserts character "X" at position 0
- User 2 inserts character "Y" at position 0

If we applied these changes as we receive them, User 1 might end up with
document "YX", and User 2 might end up with document "XY". We need an algorithm
to resolve these conflicts so everyone always end up with the same document content.

We use the Yjs CRDT to resolve these kinds of conflicts automatically for us.
Yjs enables us to represent our data using "shared types". Shared types work
just like other data types, but they automatically sync with other peers.
Practically, they enable us to map our JSON document structure that is
maintained with redux to Yjs types.

Post type entities may specify how they sync their document model with a Yjs
document. If collaborative editing is enabled, they will automatically sync with
other peers. See [# Make a post type
collaborative](#Make-a-post-type-collaborative).

### The initialization problem

We must not re-initialize the Yjs document with every session. Ultimately, this
will lead to content duplication or loss of content. To get reliable syncs
without losing content, we may only populate a Yjs document once.

Yjs works similarly to a git repository. A git repository is empty at the
beginning. We can populate it with content by making an initial commit. When
other people make changes, they fork our repository with the edit history, and
make a PR to our document.
They don't `cp -rf` the content from our git repository to a fresh repository,
because that would make merging our repositories impossible. We need to retain a
edit history, to make merging easier without creating unnecessary conflicts. It
works similarly in Yjs.

We maintain the binary-encoded Yjs document, which tracks the edit history
in a compressed form, in a comment tag of the serialized Gutenberg content.

```html
 .. HTML content ..
<!-- y:gutenberg version="1" state="(base64-encoded Yjs doc)" new-content-clientid="(u53)" -->
```

You can find more information about the `<!-- y:gutenberg -->` comment in
`./synchronization.php`.

It is important to note that Yjs only contains metadata of the edit history. It
does not track all changes forever (unless Yjs' "gabrage-collection" is
disabled). Ultimately, the Yjs document will roughly be in the size of the
serialized form of the Gutenberg document.

### Updated protocol for saving posts

When collaborative editing is enabled, we first must ensure that we don't
overwrite content from other clients that has been written to the backend.

Before we save a post, we pull the current post and merge the edits from the Yjs
document to our own document. This happens automatically if autosave is enabled,
and it happens when we manually hit the "save" button.

NO MORE CONTENT LOSS!

This is a huge improvement over the status quo, in which we can easily overwrite
contributions from other users that happened while we were updating the
document. The new algorithm ensures that all changes from other users are merged
before we save a post, while keeping full compatibility with the current
implementation of the revision history that allows us to go back to previous
versions.

### Compatibility with other editors / APIs

WordPress has a rich ecosystem of plugins that directly manipulate the HTML
content through an API request. These plugins don't know about the Yjs edit
history. They might add a paragraph without telling users that currently work on
a document. Once the users save a post, these changes would be lost. The
collaborative editing feature is compatible with legacy API requests.

When a user saves a post (through autosave, or through the "save" button), it
will first pull the current post content from WordPress and merge the changes.
If the client notices that the Yjs document is not in-sync with the HTML
content, it will first reconcile the changes to the HTML document. To ensure that all users that pull
changes from a backend reconcile in the same way, we simulate a "system user"
that generates the content for us. All clients simulate the same "system user"
changes. This is implemented by generating a unique "Yjs-clientid" on the
backend that is used to make changes to the Yjs document. This process
documented in greater detail in `./synchronization.php`.

The result is that legacy plugins now may update the HTML content directly. Once
collaborative-enabled clients notice the changes, they will be reconciled and
incorporated into the live collaborative document.

### Almost realtime for everyone

Most collaborative applications use WebSockets to send & receive changes in
real-time. Yjs supports a variety of "providers" that sync using different
network protocols. See [Yjs Docs |
Providers](https://github.com/yjs/yjs?tab=readme-ov-file#providers).

However, we currently can't build a WebSocket backend in WordPress, as this is
generally not supported by all PHP runtimes.

WebRTC is an extremely interesting technology. However, we can't rely on WebRTC
as the sole communication channel, as peers from different networks often have
trouble communicating with each other. A reliable WebRTC setup requires several
kinds of servers (TURN, STUN, and a signalling server) that we can't ship with
WordPress.

Yet, we wanted that collaborative editing is supported for all users without
needing to set up a separate server. We need a base-layer sync approach that
works for everyone.

We use the existing autosave and heartbeat APIs to create a relatively good
collaborative editing experience. Changes will only be synced every few seconds.

When collaborative editing is enabled, we regularly pull changes from the
backend using the heartbeat API. The client may ask the backend for updates on a
list of documents by sending a `y-sync` heartbeat. It will supply the last known
`new-content-clientid`, which changes whenever the document is updated. If the
clientid changed, the server will forward the Yjs update.

In order to get an improved real-time experience, users may reduce the autosave
and heartbeat interval.

### Realtime for almost everyone

The "base-layer" only needs to pull changes from WordPress through
REST APIs. Pulling changes, however, does not deliver the fastest real-time
experience.

In addition to our base-layer, Yjs enables us to mesh up different communication
channels to sync our documents.

We use y-webrtc to improve the realtime-experience for almost all users. If
users can connect to each other, y-webrtc will create a peer-to-peer connection
to exchange updates in real-time. If peers can't find each other, they will sync
through the usual base-layer approach.

### Realtime for some

Users who want a more reliable set-up, may choose to set up a y-websocket
backend (or use one of the cloud providers). This could be enabled through a
separate plugin.

## Make a post type collaborative

In the post type entity specification, add a `syncConfig` that specifies how to
sync a post type entity data model with a Yjs document.

For reference see the current syncable post types in
`@gutenberg/core-data/src/entities.js`.

Add the following information to your post type definition:

```js
const customPostTypeEntity = {
	kind: 'postType',
	name: 'custom-post-type',
	...
	syncConfig: {
		/**
		 * @param {string}  id
		 * @param {boolean} autosave
		 * @return {Promise<string>} the post content
		 */
		fetch: async ( id, autosave ) => {
			// For example, to fetch the current post
			return apiFetch( {
				path: `/wp/v2/posts/${ id }?context=edit`,
			} );
		},
		/**
		 * The state of the post changed. Reflect the changes (by computing the
		   differences) to the Yjs document.
		 *
		 * @param {Y.Doc} ydoc
		 * @param {any}   changes  The record of changed key-value pairs handed
		                           down from the redux reducer.
		 */
		applyChangesToDoc: ( ydoc, changes ) => {
			// The simplest approach would be to simply sync the whole state as
			// a single entity.
			// Note that no conflict resolution will happen if old state is
			// simply overwritten. Ideally, we perform more granular change
			// operations to the Yjs document.
			const ycontent = ydoc.getMap('content');
			ycontent.set('state', Object.assign({}, ycontent.get('state')), changes);
		},
		/**
		 * Transforms the Yjs document back to a custom state object.
		 *
		 * @param {Y.Doc} ydoc
		 * @return {any}
		 */
		fromCRDTDoc: (ydoc) => {
			return ydoc.get('state')
		}
	}
}
```

## The data flow

The current experiment updates `core-data` to leverage the YJS library for synchronization and merging changes.

These are the specific checkpoints:

1. REGISTER.
	- See `getSyncProvider().register( ... )` in `registerSyncConfigs`.
	- Not all entity types are sync-enabled at the moment, look at those that declare a `syncConfig` and `syncObjectType` in `rootEntitiesConfig`.
2. BOOTSTRAP.
	- See `getSyncProvider().bootstrap( ... )` in `getEntityRecord`.
	- The `bootstrap` function fetches the entity and sets up the callback that will dispatch the relevant Redux action when document changes are broadcasted from other peers.
3. UPDATE.
	- See `getSyncProvider().update( ... )` in `editEntityRecord`.

This is the data flow when the peer A makes a local change:

- Peer A makes a local change.
- Peer A triggers a `getSyncProvider().update( ... )` request (see `editEntityRecord`).
- All peers (including A) receive the broadcasted change and execute the callback (see `updateHandler` in `createSyncProvider.bootstrap`).
- All peers (including A) trigger a `EDIT_ENTITY_RECORD` redux action.

## Future work

### Use Yjs as the undo manager

Yjs efficiently tracks history. It ships with a selective Undo/Redo Manager
- you can choose which changes to track, and which changes not to track. It is
quite reliable and used by many collaborative editors. Even if Gutenberg decides
to stay non-collaborative, it might make sense to use the Yjs undo-manager
instead of building a custom one.

When performing changes on a Yjs document, we can specify a source / origin of
the change. Changes that originate from the Gutenberg editor are currently
tracked as changes originating from the string `"gutenberg"`.

```js
const yarray = ydoc.getArray('my array')
// Create an undo manager that tracks changes on a Y.Array data type.
// We specify that only changes originating from 'gutenberg' should be tracked.
const undoManager = new Y.UndoManager(yarray, {
	trackedorigins: new Set(['gutenberg'])
})

// this change is tracked, because it "originates" from "gutenberg"
ydoc.transact(() => {
	yarray.insert(0, ['change 1'])
}, 'gutenberg')

// this change is NOT tracked, because it uses an untracked origin.
ydoc.transact(() => {
	yarray.insert(0, ['change 2'])
}, 'some remote change')

yarray.toJSON() // => ["change 2", "change 1"]
undoManager.undo()
yarray.toJSON() // => ["change 2"]
undoManager.redo()
yarray.toJSON() // => ["change 2", "change 1"]
```

See [Yjs Docs | UndoManager](https://docs.yjs.dev/api/undo-manager) for more
information.

## What works and what doesn't

### Works

- Concurrent changes (even from non-collaborative clients) are reconciled and
  merged. There is a low chance of contend duplication. But the case of loss of content
  through concurrent changes is greatly reduced.
- We can use existing Yjs sync providers to enable realtime-sync through a
  faster protocol like y-webrtc or y-websockets.
- The y-webrtc extension may be used as progressive enhancement to enable
  realtime collaboration.

### Does not work

- Some more complex blog types seem to have buggy behavior (e.g. gallery block
  type when deleting images). This can be fixed with more user feedback.
- Undo/redo does not work.
- Entities
	- Not all entities are synced. For example, global styles are not. Look at
	  the `base` entity config for an example (it declares `syncConfig` and
	  `syncObjectType` properties).
- Users of y-webrtc may protect sessions by using a shared password to prevent
  access from other clients. At the time of writing, this approach hasn't been
  fully implemented and may pose a security risk.
