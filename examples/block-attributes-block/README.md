# Block attributes with automatic syncing

This code example shows how block attributes, including complex types like arrays, sync automatically during collaborative editing. No special handling is needed.

## Checklist block

This code example registers a "Checklist" block. Users can add, remove, and check off items. The items are stored in an array attribute.

## Syncing

Block attributes are stored as part of the serialized post content. When collaborative editing is enabled, any changes to attributes are automatically synced between peers by the RTC system. No additional code is required to opt in to syncing.
