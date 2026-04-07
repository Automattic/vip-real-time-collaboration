# Example Blocks

These example blocks demonstrate different patterns for real-time collaboration in the block editor. Each block covers a specific syncing scenario.

See each block's README for implementation details:

## [Testimonial](inner-blocks-block/) (Inner Blocks)

A two-column testimonial layout with a photo, name, and quote, built entirely from core inner blocks.

![Testimonial block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/testimonial-block.gif)

**RTC concept:** Using inner blocks that follow standard RTC patterns does not require any additional setup. Inner blocks are part of the serialized post content and sync attributes automatically between peers.

---

## [Checklist](block-attributes-block/) (Block Attributes)

An checklist where users can add, remove, and check off items.

![Checklist block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/checklist-block.gif)

**RTC concept:** Block attributes sync automatically via RTC, including complex types like arrays of objects.

---

## [Subtitle](post-meta-block/) (Post Meta)

A simple text input that stores a subtitle in custom post meta rather than block attributes.

![Subtitle block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/subtitle-block.gif)

**RTC concept:** Post-level data stored in post meta syncs automatically between peers when the meta is registered with `show_in_rest: true`.

---

## [Wikipedia Edits](local-updates-block/) (External State)

Displays a list of recent Wikipedia edits fetched from an external API, with a refresh button to load the latest data.

![Wikipedia Edits block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/wikipedia-edits-block.gif)

**RTC concept:** To represent external data without storing it in block attributes, you can use an attribute as a signal. When one peer clicks refresh, the `lastUpdated` timestamp syncs to all peers. Each peer's `useEffect` hook detects this change and independently re-fetches the data from the external API.
