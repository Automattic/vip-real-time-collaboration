/**
 * Internal dependencies
 */
import { useReadOnlyCodeEditor } from '@/hooks/use-read-only-code-editor';

/**
 * Component that manages read-only state for the code editor.
 * Returns null as it only manages side effects.
 */
export function ReadOnlyCodeEditor() {
	useReadOnlyCodeEditor();
	return null;
}
