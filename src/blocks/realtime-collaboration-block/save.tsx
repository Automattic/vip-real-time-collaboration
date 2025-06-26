import { useBlockProps } from '@wordpress/block-editor';

export function Save() {
	const blockProps = useBlockProps.save();

	return <div { ...blockProps }> Your block. </div>;
}
