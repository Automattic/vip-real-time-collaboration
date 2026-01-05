# Custom post meta values not syncing

The most common issue we have seen is custom UI for editing post meta values that don't sync in the UI even though the underlying data is syncing. This is usually caused by one of two common patterns:

## Using uncontrolled inputs that don't respond to changes in the underlying data

It is important for your inputs to be "controlled" so they respond to changes in the underlying data state. See the ReactJS docs on [Controlled and uncontrolled components](https://react.dev/learn/sharing-state-between-components#controlled-and-uncontrolled-components) for more information.

If your input is uncontrolled then it is only responding to user input and not to input from other clients.

### Example: Uncontrolled vs. Controlled Input for WordPress Meta Field

Let's say you want to edit a custom meta field `"example_subtitle"` in your block.

#### 🚫 **Uncontrolled Input (Problematic)**

This input will **not update** if the meta value changes from another client—it's only controlled by user input on this component.

```js
import { useSelect, useDispatch } from '@wordpress/data';

export default function ExampleUncontrolledInput() {
	// This gets the current value from the store *once*.
	const metaValue = useSelect(
		select => select( 'core/editor' ).getEditedPostAttribute( 'meta' )?.example_subtitle,
		[]
	);
	const { editPost } = useDispatch( 'core/editor' );

	return (
		<input
			defaultValue={ metaValue || '' }
			// onChange handler updates post meta, but input itself will not update if meta changes elsewhere
			onChange={ event => {
				editPost( {
					meta: { example_subtitle: event.target.value },
				} );
			} }
		/>
	);
}
```

#### ✅ **Controlled Input (Recommended)**

This input always reflects the underlying meta value—changing live (and remaining in sync) when another client edits the value:

```js
import { useSelect, useDispatch } from '@wordpress/data';

export default function ExampleControlledInput() {
	const metaValue = useSelect(
		select => select( 'core/editor' ).getEditedPostAttribute( 'meta' )?.example_subtitle,
		[]
	);
	const { editPost } = useDispatch( 'core/editor' );

	return (
		<input
			value={ metaValue || '' }
			onChange={ event => {
				editPost( {
					meta: { example_subtitle: event.target.value },
				} );
			} }
		/>
	);
}
```

**Why this works:**  
The input's value is always set from WordPress data. If another user or process updates the meta, the field updates in all open editors, ensuring consistent collaboration.

## Copying the value to local component state

It is also possible that you are already using a controlled input, but the underlying data is being copied into local component state which effectively "disconnects" the value from the data store.

#### 🚫 **Copying to `useState` (Anti-Pattern / Not Recommended)**

Copying post meta (or any shared attribute) into local React state using `useState` disconnects your component from the collaborative state. Updates from other clients (or the store itself) won't be received after the initial render, resulting in stale or conflicting data.

**Example (DON'T DO THIS):**

```js
import { useSelect, useDispatch } from '@wordpress/data';
import { useState } from 'react';

export default function ExampleUseStateInput() {
	const metaValue = useSelect(
		select => select( 'core/editor' ).getEditedPostAttribute( 'meta' )?.example_subtitle,
		[]
	);
	// 🚫 Copies value at mount; won't update if meta changes elsewhere!
	const [ value, setValue ] = useState( metaValue || '' );
	const { editPost } = useDispatch( 'core/editor' );

	return (
		<input
			value={ value }
			onChange={ event => {
				setValue( event.target.value );
				editPost( {
					meta: { example_subtitle: event.target.value },
				} );
			} }
		/>
	);
}
```

**What's wrong:**  
This field's `value` is now local state. If another user edits the meta, `metaValue` will update in the store, but the input won't reflect that change because `useState` preserves its initial value across renders. This easily leads to data being overwritten or appearing out of sync.

#### ✅ **Correct: Always Source From Store**

Always use controlled inputs whose value is directly derived from WordPress data (the store). This keeps all open editors in sync.

**Correct Example:**

```js
import { useSelect, useDispatch } from '@wordpress/data';

export default function ExampleControlledInput() {
	const metaValue = useSelect(
		select => select( 'core/editor' ).getEditedPostAttribute( 'meta' )?.example_subtitle,
		[]
	);
	const { editPost } = useDispatch( 'core/editor' );

	return (
		<input
			value={ metaValue || '' }
			onChange={ event => {
				editPost( {
					meta: { example_subtitle: event.target.value },
				} );
			} }
		/>
	);
}
```

# Blocks that open a modal when added to the editor

We have seen custom blocks that open a modal for user input when the block is added to the editor. Since the post content syncs with all connected clients as soon as the block is added, that block loads and opens the modal for all users.

## Solution

If it's not possible to provide defaults and forgo the initial modal entirely, one option is for the block to show a placeholder UI that requires the user to click a button before showing the modal.

# Custom post meta values not present in the store

The post meta must be [registered](https://developer.wordpress.org/reference/functions/register_meta/) with the `show_in_rest` argument set to `true`. This makes the meta available in the REST API, which is used by the block editor.

```php
register_post_meta( 'post', 'example', [
	'show_in_rest' => true, // required for syncing
	'single' => true,
	'type' => 'string',
	'revisions_enabled' => true, // recommended to track via revision history.
] );
```
