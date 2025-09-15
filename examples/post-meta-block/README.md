# Post meta block with syncing support

This code example shows how custom post meta can be synced between peers during collaborative editing. It follows [the example of a modern "metabox"](https://developer.wordpress.org/block-editor/how-to-guides/metabox/) within the block editor.

## Subtitle block

This code example registers a "Subtitle" block, which allows someone who places the block to provide a subtitle, which is stored in post meta.

## Syncing

There are two primary mechanisms that enable post meta syncing:

1. The post meta must be [registered](https://developer.wordpress.org/reference/functions/register_meta/) with the `show_in_rest` argument set to `true`. This makes the meta available in the REST API, which is used by the block editor. See `post-meta-block.php`.
2. The post meta key must not start with an underscore. WordPress treats meta keys starting with an underscore as private.

If you wish to override the default behavior of point 2 above, you may use the `sync.shouldSyncMeta` filter to allow syncing of "private" meta:

```js
wp.hooks.addFilter(
    'sync.shouldSyncMeta',
    'your-namespace/your-plugin',
    ( shouldSync, metaKey ) => {
        if ( metaKey === '_your_private_meta_key' ) {
            return true;
        }

        return shouldSync;
    }
);
```
