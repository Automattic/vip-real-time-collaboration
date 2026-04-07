# Post meta block with syncing support

![Subtitle block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/subtitle-block.gif)

---

This code example shows how custom post meta can be synced between peers during collaborative editing. It follows [the example of a modern "metabox"](https://developer.wordpress.org/block-editor/how-to-guides/metabox/) within the block editor.

## Subtitle block

This code example registers a "Subtitle" block, which allows someone who places the block to provide a subtitle, which is stored in post meta.

## Syncing

The post meta must be [registered](https://developer.wordpress.org/reference/functions/register_meta/) with the `show_in_rest` argument set to `true`. This makes the meta available in the REST API, which is used by the block editor. See `post-meta-block.php`.
