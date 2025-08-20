import { useEffect, useState } from '@wordpress/element';

import { getCurrentEntity } from '@/utilities/entity';

import type { CurrentEntity } from '@/utilities/entity';

export function useCurrentEntity(): CurrentEntity | null {
	const [ currentEntity, setCurrentEntity ] = useState< CurrentEntity | null >( null );

	useEffect( () => {
		const fetchEntity = async () => {
			const currentEntityResult = await getCurrentEntity();
			setCurrentEntity( currentEntityResult );
		};

		void fetchEntity();
	}, [] );

	return currentEntity;
}
