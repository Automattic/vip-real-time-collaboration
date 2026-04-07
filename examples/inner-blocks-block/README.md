# Inner blocks with automatic syncing

This code example shows a case of real-time collaboration using inner blocks. Inner blocks sync automatically. No special handling is needed.

## Testimonial block

---

![Testimonial block](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/assets/testimonial-block.gif)

---

This code example registers a "Testimonial" block that uses inner blocks to provide a two-column layout: a photo on the left, with the person's name and a quote on the right. The inner blocks are standard core blocks (Image, Heading, and Quote) provided via a block template.

## Syncing

Inner blocks are stored as part of the serialized post content. When collaborative editing is enabled, any changes to inner blocks are automatically synced between peers by the RTC system. No additional code is required to opt in to syncing.
