export function getCurrentEntity(): { objectType: string; objectId: string } {
	const objectType = 'postType/Posts';
	const objectId = '1';

	return { objectType, objectId };
}

export function useEditorEntity(): { objectType: string; objectId: string } {
	const { objectType, objectId } = getCurrentEntity();
	return { objectType, objectId };
}
